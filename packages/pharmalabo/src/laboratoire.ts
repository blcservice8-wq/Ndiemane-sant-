import { exiger, type Utilisateur } from "../../auth/src/rbac.js";
export type Statut = "DEMANDEE" | "PRELEVEE" | "RESULTAT_SAISI" | "VALIDEE" | "ANNULEE";
const TRANSITIONS: Record<Statut, Statut[]> = { DEMANDEE: ["PRELEVEE", "ANNULEE"], PRELEVEE: ["RESULTAT_SAISI", "ANNULEE"],
  RESULTAT_SAISI: ["VALIDEE", "PRELEVEE"], VALIDEE: [], ANNULEE: [] };
export const transitionPermise = (de: Statut, vers: Statut) => TRANSITIONS[de].includes(vers);

export type Demande = { id: string; statut: Statut; resultat?: { valeur: string; technicienId: string } };
export interface DepotLabo { demande(id: string): Promise<Demande | null>; changerStatut(id: string, vers: Statut, extra?: Record<string, unknown>): Promise<void>; }
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string }): Promise<void> }

async function avancer(d: DepotLabo, a: Audit, u: Utilisateur, id: string, vers: Statut, action: string, extra?: Record<string, unknown>) {
  const dem = await d.demande(id); if (!dem) throw new Error("Demande introuvable");
  if (!transitionPermise(dem.statut, vers)) throw new Error(`Transition interdite : ${dem.statut} -> ${vers}`);
  await d.changerStatut(id, vers, extra); await a.log({ action, utilisateurId: u.id, entite: "DemandeAnalyse", entiteId: id });
}
export async function prelever(d: DepotLabo, a: Audit, u: Utilisateur, id: string) { exiger(u, "laboratoire", "CREER"); return avancer(d, a, u, id, "PRELEVEE", "LABO_PRELEVEMENT"); }
export async function saisirResultat(d: DepotLabo, a: Audit, u: Utilisateur, id: string, valeur: string) {
  exiger(u, "laboratoire", "MODIFIER"); if (!valeur.trim()) throw new Error("Résultat vide");
  return avancer(d, a, u, id, "RESULTAT_SAISI", "LABO_RESULTAT", { valeur, technicienId: u.id });
}
export async function validerResultat(d: DepotLabo, a: Audit, u: Utilisateur, id: string) {
  exiger(u, "laboratoire", "VALIDER");
  const dem = await d.demande(id);
  if (dem?.resultat?.technicienId === u.id && !u.roles.includes("RESPONSABLE_POSTE")) throw new Error("La validation doit être faite par une autre personne que celle qui a saisi");
  return avancer(d, a, u, id, "VALIDEE", "LABO_VALIDATION");
}
/** Valeur hors intervalle numérique de référence (aide visuelle, pas un diagnostic). */
export function horsReference(valeur: string, min?: number, max?: number): boolean | null {
  const v = Number(valeur.replace(",", ".")); if (!Number.isFinite(v)) return null;
  return (min !== undefined && v < min) || (max !== undefined && v > max);
}
export const statistiques = (d: { examen: string; statut: Statut }[]) => {
  const r: Record<string, number> = {}; for (const x of d.filter((y) => y.statut === "VALIDEE")) r[x.examen] = (r[x.examen] ?? 0) + 1; return r;
};
