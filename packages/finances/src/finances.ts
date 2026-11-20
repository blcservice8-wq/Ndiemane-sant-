// Gestion financière du poste. N'est PAS un outil de comptabilité réglementaire certifié.
import { exiger, peut, type Utilisateur } from "../../auth/src/rbac.js";

export const estMontantFcfa = (n: number) => Number.isInteger(n) && n > 0;

// ---------- Journal de caisse (append-only) ----------
export type LigneCaisse = { id: string; date: Date; libelle: string; entreeFcfa: number; sortieFcfa: number; soldeFcfa: number; refType?: string; refId?: string; contrePasseDe?: string };
export const soldeCaisse = (j: LigneCaisse[]) => j.length ? j[j.length - 1].soldeFcfa : 0;

export function ajouterLigne(j: LigneCaisse[], l: { id: string; date: Date; libelle: string; entreeFcfa?: number; sortieFcfa?: number; refType?: string; refId?: string; contrePasseDe?: string }, decouvertAutorise = false): LigneCaisse[] {
  const e = l.entreeFcfa ?? 0, s = l.sortieFcfa ?? 0;
  if ((e > 0) === (s > 0)) throw new Error("Une écriture doit être soit une entrée, soit une sortie");
  if (!estMontantFcfa(e || s)) throw new Error("Montant invalide (entier positif en FCFA)");
  if (!l.libelle.trim()) throw new Error("Libellé obligatoire");
  if (j.length && l.date < j[j.length - 1].date) throw new Error("Écriture antérieure à la dernière écriture du journal");
  const solde = soldeCaisse(j) + e - s;
  if (solde < 0 && !decouvertAutorise) throw new Error("Solde de caisse insuffisant");
  return [...j, { ...l, entreeFcfa: e, sortieFcfa: s, soldeFcfa: solde }];
}
/** Correction = écriture inverse liée à l'originale. Jamais de modification ni de suppression. */
export function contrepasser(j: LigneCaisse[], idOriginal: string, nouvelId: string, date: Date, motif: string): LigneCaisse[] {
  const o = j.find((x) => x.id === idOriginal); if (!o) throw new Error("Écriture introuvable");
  if (o.contrePasseDe) throw new Error("Une écriture de correction ne peut pas être corrigée");
  if (j.some((x) => x.contrePasseDe === idOriginal)) throw new Error("Écriture déjà corrigée");
  if (!motif.trim()) throw new Error("Motif de correction obligatoire");
  return ajouterLigne(j, { id: nouvelId, date, libelle: `Correction : ${motif} (${o.libelle})`, entreeFcfa: o.sortieFcfa || undefined, sortieFcfa: o.entreeFcfa || undefined, contrePasseDe: idOriginal, refType: o.refType, refId: o.refId }, true);
}
/** Clôture de caisse : écart entre comptage physique et solde théorique. */
export const ecartCloture = (j: LigneCaisse[], comptePhysiqueFcfa: number) => ({ theorique: soldeCaisse(j), compte: comptePhysiqueFcfa, ecart: comptePhysiqueFcfa - soldeCaisse(j) });

// ---------- Recettes ----------
export type Recette = { type: string; montantFcfa: number; date: Date };
export function totauxRecettes(r: Recette[], debut: Date, fin: Date) {
  const par: Record<string, number> = {}; let total = 0;
  for (const x of r.filter((y) => y.date >= debut && y.date <= fin)) { par[x.type] = (par[x.type] ?? 0) + x.montantFcfa; total += x.montantFcfa; }
  return { total, parType: par };
}

// ---------- Budget ----------
export type Engagement = { budgetId: string; montantFcfa: number; actif: boolean };
export type DepenseB = { budgetId: string; montantFcfa: number; statut: StatutDepense };
export function executionBudget(budgetFcfa: number, engagements: Engagement[], depenses: DepenseB[]) {
  const engage = engagements.filter((e) => e.actif).reduce((s, e) => s + e.montantFcfa, 0);
  const paye = depenses.filter((d) => d.statut === "PAYEE").reduce((s, d) => s + d.montantFcfa, 0);
  return { budget: budgetFcfa, engage, paye, disponible: budgetFcfa - engage, tauxEngagement: budgetFcfa ? Math.round((engage / budgetFcfa) * 1000) / 10 : null, tauxExecution: budgetFcfa ? Math.round((paye / budgetFcfa) * 1000) / 10 : null };
}

// ---------- Dépenses : circuit de validation ----------
export type StatutDepense = "DEMANDEE" | "ENGAGEE" | "VALIDEE" | "PAYEE" | "REJETEE";
const TRANSITIONS: Record<StatutDepense, StatutDepense[]> = { DEMANDEE: ["ENGAGEE", "REJETEE"], ENGAGEE: ["VALIDEE", "REJETEE"], VALIDEE: ["PAYEE", "REJETEE"], PAYEE: [], REJETEE: [] };
export type Depense = { id: string; libelle: string; montantFcfa: number; statut: StatutDepense; demandeurId: string; validateurId?: string | null; justificatifId?: string | null; budgetId?: string | null };
export type ContexteFinance = { budgetDisponibleFcfa: number | null; soldeCaisseFcfa: number; seuilResponsableFcfa: number };

/** Règles métier d'une transition ; renvoie la liste des erreurs (vide = autorisé). */
export function controlerTransition(dep: Depense, vers: StatutDepense, u: Utilisateur, ctx: ContexteFinance): string[] {
  const e: string[] = [];
  if (!TRANSITIONS[dep.statut].includes(vers)) return [`Transition interdite : ${dep.statut} -> ${vers}`];
  if (vers === "ENGAGEE" && ctx.budgetDisponibleFcfa !== null && dep.montantFcfa > ctx.budgetDisponibleFcfa) e.push("Budget disponible insuffisant");
  if (vers === "VALIDEE") {
    if (u.id === dep.demandeurId) e.push("Le demandeur ne peut pas valider sa propre dépense");
    if (dep.montantFcfa > ctx.seuilResponsableFcfa && !u.roles.includes("RESPONSABLE_POSTE")) e.push("Au-dessus du seuil : validation du responsable du poste requise");
  }
  if (vers === "PAYEE") {
    if (!dep.justificatifId) e.push("Justificatif obligatoire avant paiement");
    if (!dep.validateurId) e.push("Dépense non validée");
    if (dep.montantFcfa > ctx.soldeCaisseFcfa) e.push("Solde de caisse insuffisant");
  }
  return e;
}

export interface DepotFinance {
  depense(id: string): Promise<Depense | null>;
  contexte(dep: Depense): Promise<ContexteFinance>;
  /** Doit changer le statut ET écrire la ligne de caisse (si fournie) dans UNE transaction. */
  appliquer(id: string, vers: StatutDepense, validateurId: string | undefined, ligneCaisse: { libelle: string; sortieFcfa: number; refId: string } | null): Promise<void>;
}
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string; details?: unknown }): Promise<void> }

export async function avancerDepense(d: DepotFinance, a: Audit, u: Utilisateur, id: string, vers: StatutDepense) {
  exiger(u, "finances", vers === "VALIDEE" || vers === "REJETEE" ? "VALIDER" : "MODIFIER");
  const dep = await d.depense(id); if (!dep) throw new Error("Dépense introuvable");
  const erreurs = controlerTransition(dep, vers, u, await d.contexte(dep));
  if (erreurs.length) { await a.log({ action: "DEPENSE_REFUSEE", utilisateurId: u.id, entite: "Depense", entiteId: id, details: erreurs }); return { ok: false as const, erreurs }; }
  await d.appliquer(id, vers, vers === "VALIDEE" ? u.id : undefined, vers === "PAYEE" ? { libelle: dep.libelle, sortieFcfa: dep.montantFcfa, refId: id } : null);
  await a.log({ action: `DEPENSE_${vers}`, utilisateurId: u.id, entite: "Depense", entiteId: id, details: { montantFcfa: dep.montantFcfa } });
  return { ok: true as const };
}
export const peutVoirFinances = (u: Utilisateur) => peut(u, "finances", "LIRE");

// ---------- Trésorerie ----------
export function tresorerie(entrees: number, sorties: number, soldeInitial: number, dettesFournisseurs: number, creances = 0) {
  const soldeFinal = soldeInitial + entrees - sorties; return { soldeInitial, entrees, sorties, soldeFinal, apresDettes: soldeFinal - dettesFournisseurs + creances };
}
