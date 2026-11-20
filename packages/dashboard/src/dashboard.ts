import { peut, type Utilisateur } from "../../auth/src/rbac.js";
import type { DepotStats, Periode, StatsSanitaires, StatsPharmacie, StatsPersonnel, StatsEquipements, StatsFinances, LigneObjectif, AlerteResume } from "./types.js";

export function periodeDepuis(date: Date): Periode {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { jourDebut: d, moisDebut: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
    anneeDebut: new Date(Date.UTC(d.getUTCFullYear(), 0, 1)), fin: date };
}
export const tauxRealisation = (cible: number, realise: number): number | null =>
  cible > 0 ? Math.round((realise / cible) * 1000) / 10 : null;

export type TableauDeBord = {
  genereLe: string;
  sanitaire?: StatsSanitaires; pharmacie?: StatsPharmacie; personnel?: StatsPersonnel; equipements?: StatsEquipements;
  finances?: StatsFinances & { solde: number };
  objectifs?: (LigneObjectif & { taux: number | null })[]; alertes: AlerteResume[];
};

/** Ne charge et ne renvoie que les sections autorisées pour l'utilisateur. */
export async function construireTableauDeBord(depot: DepotStats, u: Utilisateur, maintenant = new Date()): Promise<TableauDeBord> {
  if (!peut(u, "tableau_bord", "LIRE")) throw new Error("Accès refusé : tableau_bord/LIRE");
  const p = periodeDepuis(maintenant);
  const [sanitaire, pharmacie, personnel, equipements, finances, objectifs, alertes] = await Promise.all([
    peut(u, "patients", "LIRE") || peut(u, "consultations", "LIRE") ? depot.sanitaires(p) : undefined,
    peut(u, "pharmacie", "LIRE") ? depot.pharmacie(p) : undefined,
    peut(u, "personnel", "LIRE") ? depot.personnel(p) : undefined,
    peut(u, "batiments_equipements", "LIRE") ? depot.equipements() : undefined,
    peut(u, "finances", "LIRE") ? depot.finances(p) : undefined,
    peut(u, "programmes", "LIRE") ? depot.objectifs(p) : undefined,
    depot.alertes(),
  ]);
  const ordre = { CRITIQUE: 0, ATTENTION: 1, INFO: 2 } as const;
  const modulePar: Record<string, Parameters<typeof peut>[1]> = { STOCK_FAIBLE: "pharmacie", RUPTURE: "pharmacie", PEREMPTION: "pharmacie",
    PANNE: "batiments_equipements", MAINTENANCE: "batiments_equipements", CONGE: "personnel", DOCUMENT_EXPIRANT: "documents",
    ECHEANCE: "finances", RENDEZ_VOUS: "patients", RAPPORT_RETARD: "rapports" };
  const alertesVisibles = alertes.filter((a) => { const m = modulePar[a.type]; return m ? peut(u, m, "LIRE") : true; })
    .sort((a, b) => ordre[a.severite] - ordre[b.severite]);
  return { genereLe: maintenant.toISOString(), sanitaire, pharmacie, personnel, equipements,
    finances: finances && { ...finances, solde: finances.recettesMois - finances.depensesMois },
    objectifs: objectifs?.map((o) => ({ ...o, taux: tauxRealisation(o.cible, o.realise) })), alertes: alertesVisibles };
}
