import { exiger, type Utilisateur } from "../../auth/src/rbac.js";
const JOUR = 86_400_000;

// ---------- Codes d'inventaire (contenu du QR / code-barres) ----------
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function cle(s: string): string { let sum = 0; for (let i = 0; i < s.length; i++) sum += (ALPHA.indexOf(s[i]) + 1) * (i + 1); return ALPHA[sum % 36]; }
export function genererCode(codeSite: string, seq: number): string {
  const base = `${codeSite}${String(seq).padStart(6, "0")}`; return `EQ-${codeSite}-${String(seq).padStart(6, "0")}-${cle(base)}`;
}
export function codeValide(code: string): boolean {
  const m = /^EQ-([A-Z0-9]+)-(\d{6})-([0-9A-Z])$/.exec(code); return !!m && cle(m[1] + m[2]) === m[3];
}

// ---------- Équipements ----------
export type Etat = "FONCTIONNEL" | "EN_PANNE" | "EN_MAINTENANCE" | "HORS_SERVICE";
const TRANSITIONS: Record<Etat, Etat[]> = { FONCTIONNEL: ["EN_PANNE", "EN_MAINTENANCE", "HORS_SERVICE"], EN_PANNE: ["EN_MAINTENANCE", "FONCTIONNEL", "HORS_SERVICE"],
  EN_MAINTENANCE: ["FONCTIONNEL", "EN_PANNE", "HORS_SERVICE"], HORS_SERVICE: [] };
export const transitionEtat = (de: Etat, vers: Etat) => TRANSITIONS[de].includes(vers);

export type Equipement = { id: string; designation: string; etat: Etat; valeurFcfa?: number | null; dateAcquisition?: Date | null; garantieFin?: Date | null };
export type Maintenance = { equipementId: string; type: "PREVENTIVE" | "CORRECTIVE"; date: Date; prochaineDate?: Date | null; coutFcfa: number };

export function validerEquipement(e: { designation: string; valeurFcfa?: number | null; dateAcquisition?: Date | null; garantieFin?: Date | null }): string[] {
  const r: string[] = [];
  if (!e.designation?.trim()) r.push("Désignation obligatoire");
  if (e.valeurFcfa != null && e.valeurFcfa < 0) r.push("Valeur négative");
  if (e.garantieFin && e.dateAcquisition && e.garantieFin < e.dateAcquisition) r.push("Fin de garantie avant l'acquisition");
  return r;
}
export const sousGarantie = (e: Equipement, maintenant: Date) => !!e.garantieFin && e.garantieFin.getTime() >= maintenant.getTime();
export const coutMaintenance = (m: Maintenance[], equipementId?: string) => m.filter((x) => !equipementId || x.equipementId === equipementId).reduce((s, x) => s + x.coutFcfa, 0);
/** Amortissement linéaire ; la durée de vie est un paramètre du poste. */
export function valeurNette(valeur: number, acquisition: Date, dureeVieAns: number, maintenant: Date): number {
  const ecoule = (maintenant.getTime() - acquisition.getTime()) / (365.25 * JOUR);
  return Math.round(valeur * Math.max(0, 1 - ecoule / dureeVieAns));
}
export function alertesEquipements(eq: Equipement[], maint: Maintenance[], maintenant: Date, preavisJours = 30) {
  const out: { type: "PANNE" | "MAINTENANCE" | "GARANTIE"; equipementId: string; message: string }[] = [];
  for (const e of eq) {
    if (e.etat === "EN_PANNE") out.push({ type: "PANNE", equipementId: e.id, message: `${e.designation} en panne` });
    if (sousGarantie(e, maintenant) && e.garantieFin!.getTime() - maintenant.getTime() <= preavisJours * JOUR) out.push({ type: "GARANTIE", equipementId: e.id, message: `Garantie de ${e.designation} expire bientôt` });
    const derniere = maint.filter((m) => m.equipementId === e.id && m.prochaineDate).sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    if (derniere?.prochaineDate && derniere.prochaineDate.getTime() <= maintenant.getTime() + preavisJours * JOUR && e.etat !== "HORS_SERVICE")
      out.push({ type: "MAINTENANCE", equipementId: e.id, message: `Maintenance de ${e.designation} ${derniere.prochaineDate < maintenant ? "en retard" : "à planifier"}` });
  }
  return out;
}

// ---------- Bâtiments ----------
export type EtatBatiment = "BON" | "MOYEN" | "DEGRADE" | "CRITIQUE";
export type Travaux = { batimentId: string; budgetFcfa: number; statut: "PLANIFIE" | "EN_COURS" | "TERMINE" | "ANNULE" };
const GRAVITE: Record<EtatBatiment, number> = { CRITIQUE: 0, DEGRADE: 1, MOYEN: 2, BON: 3 };
export const batimentsATravaux = (b: { id: string; nom: string; etat: EtatBatiment }[]) => b.filter((x) => x.etat === "DEGRADE" || x.etat === "CRITIQUE").sort((a, c) => GRAVITE[a.etat] - GRAVITE[c.etat]);
export function budgetReabilitation(t: Travaux[]) {
  const r = { aFinancer: 0, enCours: 0, realise: 0 };
  for (const x of t) { if (x.statut === "PLANIFIE") r.aFinancer += x.budgetFcfa; else if (x.statut === "EN_COURS") r.enCours += x.budgetFcfa; else if (x.statut === "TERMINE") r.realise += x.budgetFcfa; }
  return r;
}
export function validerTravaux(t: { description: string; budgetFcfa: number; dateDebut?: Date | null; dateFin?: Date | null }): string[] {
  const e: string[] = [];
  if (!t.description?.trim()) e.push("Description obligatoire");
  if (t.budgetFcfa < 0) e.push("Budget négatif");
  if (t.dateDebut && t.dateFin && t.dateFin < t.dateDebut) e.push("La fin précède le début");
  return e;
}

// ---------- Service ----------
export interface DepotPatrimoine {
  etat(equipementId: string): Promise<Etat | null>;
  changerEtat(equipementId: string, vers: Etat): Promise<void>;
  prochaineSequence(siteId: string): Promise<number>;
  creer(e: { siteId: string; codeQr: string; designation: string }): Promise<{ id: string }>;
}
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string; details?: unknown }): Promise<void> }

export async function enregistrerEquipement(d: DepotPatrimoine, a: Audit, u: Utilisateur, site: { id: string; code: string }, e: { designation: string; valeurFcfa?: number; dateAcquisition?: Date; garantieFin?: Date }) {
  exiger(u, "batiments_equipements", "CREER");
  const erreurs = validerEquipement(e); if (erreurs.length) return { ok: false as const, erreurs };
  const codeQr = genererCode(site.code, await d.prochaineSequence(site.id));
  const { id } = await d.creer({ siteId: site.id, codeQr, designation: e.designation });
  await a.log({ action: "EQUIPEMENT_CREE", utilisateurId: u.id, entite: "Equipement", entiteId: id }); return { ok: true as const, id, codeQr };
}
export async function changerEtatEquipement(d: DepotPatrimoine, a: Audit, u: Utilisateur, id: string, vers: Etat) {
  exiger(u, "batiments_equipements", "MODIFIER");
  const de = await d.etat(id); if (!de) throw new Error("Équipement introuvable");
  if (!transitionEtat(de, vers)) throw new Error(`Transition interdite : ${de} -> ${vers}`);
  if (vers === "HORS_SERVICE") exiger(u, "batiments_equipements", "VALIDER"); // la réforme est une décision validée
  await d.changerEtat(id, vers); await a.log({ action: "EQUIPEMENT_ETAT", utilisateurId: u.id, entite: "Equipement", entiteId: id, details: { de, vers } });
}
