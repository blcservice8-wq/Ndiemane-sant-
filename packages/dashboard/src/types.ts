export type Periode = { jourDebut: Date; moisDebut: Date; anneeDebut: Date; fin: Date };
export type Compte = { patients: number };
export type StatsSanitaires = { patientsEnregistres: number; consultationsJour: number; consultationsMois: number; consultationsAnnee: number;
  maternite: number | null; vaccinations: number; analysesLabo: number };
export type StatsPharmacie = { produitsActifs: number; ruptures: { id: string; designation: string }[]; stocksFaibles: number; peremptionsProches: number };
export type StatsPersonnel = { effectifActif: number; enConge: number };
export type StatsEquipements = { fonctionnels: number; enPanne: number; batimentsATravaux: number };
export type StatsFinances = { recettesMois: number; depensesMois: number; depensesEnAttenteValidation: number };
export type LigneObjectif = { indicateur: string; cible: number; realise: number };
export type AlerteResume = { type: string; severite: "INFO" | "ATTENTION" | "CRITIQUE"; message: string };

/** Chaque méthode lit la base : aucune valeur n'est inventée. */
export interface DepotStats {
  sanitaires(p: Periode): Promise<StatsSanitaires>;
  pharmacie(p: Periode): Promise<StatsPharmacie>;
  personnel(p: Periode): Promise<StatsPersonnel>;
  equipements(): Promise<StatsEquipements>;
  finances(p: Periode): Promise<StatsFinances>;
  objectifs(p: Periode): Promise<LigneObjectif[]>;
  alertes(): Promise<AlerteResume[]>;
}
