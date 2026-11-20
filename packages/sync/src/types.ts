export type Op = "CREATE" | "UPDATE" | "DELETE";
export type Donnees = Record<string, unknown>;
export type Enreg = { entite: string; id: string; version: number; data: Donnees; majLe: number; supprime: boolean; siteId: string };
export type Operation = { cle: string; siteId: string; entite: string; entiteId: string; operation: Op; charge: Donnees; versionBase: number; creeLe: number };

/** ADDITIF : seulement des créations (ex. mouvements de stock). DERNIERE_VERSION : fiches simples.
 *  MANUEL : données cliniques, conflit résolu par un humain. IMMUABLE : verrouillé selon `verrou`, sinon DERNIERE_VERSION. */
export type Politique = "ADDITIF" | "DERNIERE_VERSION" | "MANUEL" | "IMMUABLE";
export type ConfigEntite = { politique: Politique; empreinte?: string; verrou?: (d: Donnees) => boolean };
export type Politiques = Record<string, ConfigEntite>;

export type Conflit = { cleOperation: string; entite: string; entiteId: string; type: "VERSION" | "DOUBLON_POSSIBLE"; valeurLocale: Donnees; valeurCentrale: Donnees | null; resolution: string | null };
export type Issue = { statut: "APPLIQUEE" | "DEJA_APPLIQUEE" | "CONFLIT" | "REJETEE"; raison?: string; version?: number; conflit?: Conflit };
export interface Transport {
  push(ops: Operation[]): Promise<Issue[]>;
  pull(curseur: number): Promise<{ changements: Enreg[]; curseur: number }>;
  lire(entite: string, id: string): Promise<Enreg | null>;
}
