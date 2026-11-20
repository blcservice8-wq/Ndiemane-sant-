import { exiger, type Utilisateur } from "../../auth/src/rbac.js";

export const TYPES_ASSOCIATION = ["CDS", "BAJENU_GOX", "RELAIS", "FEMMES", "JEUNES", "VILLAGEOISE"] as const;
export type TypeAssociation = (typeof TYPES_ASSOCIATION)[number];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- Associations et membres ----------
export function validerAssociation(a: { nom: string; type: string; localite?: string }, existantes: { nom: string; localite?: string }[] = []): string[] {
  const e: string[] = [];
  if (!a.nom?.trim()) e.push("Nom obligatoire");
  if (!(TYPES_ASSOCIATION as readonly string[]).includes(a.type)) e.push("Type d'association invalide");
  if (existantes.some((x) => norm(x.nom) === norm(a.nom) && norm(x.localite ?? "") === norm(a.localite ?? ""))) e.push("Association déjà enregistrée dans cette localité");
  return e;
}
export type Membre = { nom: string; fonction?: string; telephone?: string; actif?: boolean };
export function validerMembre(m: Membre, existants: Membre[] = []): string[] {
  const e: string[] = [];
  if (!m.nom?.trim()) e.push("Nom obligatoire");
  if (m.telephone && !/^\+?[0-9]{8,15}$/.test(m.telephone.replace(/[ .-]/g, ""))) e.push("Téléphone invalide");
  if (existants.some((x) => norm(x.nom) === norm(m.nom))) e.push("Membre déjà enregistré");
  return e;
}
const FONCTIONS_UNIQUES = ["PRESIDENT", "PRESIDENTE", "TRESORIER", "TRESORIERE", "SECRETAIRE"];
export function validerBureau(membres: Membre[]): string[] {
  const e: string[] = [];
  for (const f of FONCTIONS_UNIQUES) if (membres.filter((m) => m.actif !== false && norm(m.fonction ?? "") === norm(f)).length > 1) e.push(`Plusieurs titulaires pour la fonction ${f.toLowerCase()}`);
  return e;
}
export const effectifActif = (m: Membre[]) => m.filter((x) => x.actif !== false).length;

// ---------- Réunions et procès-verbaux ----------
export type Reunion = { associationId: string; date: Date; ordreDuJour: string[]; presents: number; effectif: number };
export const quorumAtteint = (r: Pick<Reunion, "presents" | "effectif">, quorumPct: number) => r.effectif > 0 && (r.presents / r.effectif) * 100 >= quorumPct;
export type StatutPV = "BROUILLON" | "ADOPTE";
export type PV = { reunionId: string; statut: StatutPV; decisions: string[]; redacteur: string; contenu: string };
export function validerPV(pv: Pick<PV, "decisions" | "redacteur" | "contenu">, r: Reunion, quorumPct: number, maintenant: Date): string[] {
  const e: string[] = [];
  if (r.date > maintenant) e.push("Réunion dans le futur");
  if (!r.ordreDuJour.length) e.push("Ordre du jour obligatoire");
  if (!pv.contenu?.trim()) e.push("Contenu du procès-verbal obligatoire");
  if (!pv.redacteur?.trim()) e.push("Rédacteur obligatoire");
  if (r.presents > r.effectif) e.push("Présents supérieurs à l'effectif");
  if (!quorumAtteint(r, quorumPct)) e.push(`Quorum non atteint (${quorumPct} % requis) : décisions non valides`);
  return e;
}
export function modifierPV(pv: PV, changements: Partial<Pick<PV, "decisions" | "contenu">>): PV {
  if (pv.statut === "ADOPTE") throw new Error("Procès-verbal adopté : modification interdite");
  return { ...pv, ...changements };
}
export const adopterPV = (pv: PV): PV => { if (pv.statut === "ADOPTE") throw new Error("Déjà adopté"); return { ...pv, statut: "ADOPTE" }; };

// ---------- Activités communautaires ----------
export type TypeActivite = "REUNION" | "SENSIBILISATION" | "MOBILISATION";
export type Activite = { associationId: string; type: TypeActivite; date: Date; participants?: number | null; theme?: string };
export function validerActivite(a: Activite, maintenant: Date): string[] {
  const e: string[] = [];
  if (!["REUNION", "SENSIBILISATION", "MOBILISATION"].includes(a.type)) e.push("Type d'activité invalide");
  if (a.date > maintenant) e.push("Activité réalisée dans le futur (utiliser la planification)");
  if (a.participants != null && (!Number.isInteger(a.participants) || a.participants < 0)) e.push("Nombre de participants invalide");
  if (a.type === "SENSIBILISATION" && !a.theme?.trim()) e.push("Thème obligatoire pour une sensibilisation");
  return e;
}
export function bilanActivites(acts: Activite[], debut: Date, fin: Date) {
  const sel = acts.filter((a) => a.date >= debut && a.date <= fin);
  const parType: Record<string, { nombre: number; participants: number }> = {};
  for (const a of sel) { const t = (parType[a.type] ??= { nombre: 0, participants: 0 }); t.nombre++; t.participants += a.participants ?? 0; }
  return { total: sel.length, participants: sel.reduce((s, a) => s + (a.participants ?? 0), 0), parType };
}
/** Associations sans activité depuis N jours (relance du poste). */
export function associationsInactives(ids: string[], acts: Activite[], maintenant: Date, jours = 90) {
  const lim = maintenant.getTime() - jours * 86_400_000;
  return ids.filter((id) => !acts.some((a) => a.associationId === id && a.date.getTime() >= lim));
}

// ---------- Cotisations / contributions ----------
export type Contribution = { associationId: string; montantFcfa: number; date: Date };
export const totalContributions = (c: Contribution[], associationId?: string) => c.filter((x) => !associationId || x.associationId === associationId).reduce((s, x) => s + x.montantFcfa, 0);
export function validerContribution(c: Contribution): string[] { return c.montantFcfa > 0 && Number.isInteger(c.montantFcfa) ? [] : ["Montant invalide (entier positif en FCFA)"]; }

// ---------- Confidentialité ----------
/** Rapport communautaire : uniquement des agrégats, jamais de données de patients. */
export function rapportCommunautaire(bilan: ReturnType<typeof bilanActivites>, effectifs: Record<string, number>, contributionsFcfa: number) {
  return { activites: bilan, effectifsParAssociation: effectifs, contributionsFcfa };
}

// ---------- Service ----------
export interface DepotAssociations { creer(siteId: string, a: { nom: string; type: string; localite?: string }): Promise<{ id: string }>; existantes(siteId: string): Promise<{ nom: string; localite?: string }[]>; }
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string }): Promise<void> }
export async function enregistrerAssociation(d: DepotAssociations, a: Audit, u: Utilisateur, siteId: string, assoc: { nom: string; type: string; localite?: string }) {
  exiger(u, "partenaires_associations", "CREER");
  const erreurs = validerAssociation(assoc, await d.existantes(siteId)); if (erreurs.length) return { ok: false as const, erreurs };
  const { id } = await d.creer(siteId, assoc); await a.log({ action: "ASSOCIATION_CREEE", utilisateurId: u.id, entite: "Association", entiteId: id }); return { ok: true as const, id };
}
