export const MODULES = ["tableau_bord","patients","consultations","maternite_vaccination","pharmacie","laboratoire","personnel",
  "batiments_equipements","fournisseurs","partenaires_associations","finances","programmes","programmes_vih","documents","rapports","utilisateurs","audit","parametres","sauvegardes"] as const;
export type Module = (typeof MODULES)[number];
export const ACTIONS = ["LIRE","CREER","MODIFIER","VALIDER","ARCHIVER","EXPORTER"] as const;
export type Action = (typeof ACTIONS)[number];
export type Matrice = Partial<Record<Module, Action[]>>;
export type Utilisateur = { id: string; roles: string[]; surcharges?: Matrice };

const L: Action[] = ["LIRE"], LE: Action[] = ["LIRE","EXPORTER"];
const LCM: Action[] = ["LIRE","CREER","MODIFIER"], FULL: Action[] = ["LIRE","CREER","MODIFIER","VALIDER","ARCHIVER","EXPORTER"];

export const ROLES: Record<string, { libelle: string; droits: Matrice }> = {
  ADMIN_SYSTEME: { libelle: "Administrateur système", droits: { utilisateurs: FULL, parametres: FULL, sauvegardes: FULL, audit: LE } },
  RESPONSABLE_POSTE: { libelle: "Responsable du poste", droits: {
    tableau_bord: L, patients: L, consultations: L, maternite_vaccination: L, pharmacie: ["LIRE","VALIDER"], laboratoire: L,
    personnel: ["LIRE","VALIDER"], batiments_equipements: ["LIRE","VALIDER"], fournisseurs: ["LIRE","VALIDER"],
    partenaires_associations: ["LIRE","VALIDER"], finances: ["LIRE","VALIDER","EXPORTER"], programmes: L, documents: L, rapports: ["LIRE","VALIDER","EXPORTER"], audit: L } },
  INFIRMIER_CHEF: { libelle: "Infirmier chef de poste", droits: {
    tableau_bord: L, patients: ["LIRE","CREER","MODIFIER","VALIDER"], consultations: ["LIRE","CREER","MODIFIER","VALIDER"],
    maternite_vaccination: ["LIRE","CREER","MODIFIER","VALIDER"], pharmacie: L, laboratoire: L, personnel: L, batiments_equipements: L,
    programmes: ["LIRE","CREER","MODIFIER","VALIDER"], programmes_vih: ["LIRE","CREER","MODIFIER"], rapports: LE } },
  SAGE_FEMME: { libelle: "Sage-femme", droits: {
    tableau_bord: L, patients: LCM, consultations: LCM, maternite_vaccination: ["LIRE","CREER","MODIFIER","VALIDER"],
    pharmacie: L, laboratoire: L, programmes: LCM, rapports: L } },
  AGENT_SANTE: { libelle: "Agent de santé", droits: {
    tableau_bord: L, patients: LCM, consultations: LCM, maternite_vaccination: ["LIRE","CREER"], pharmacie: L, laboratoire: L } },
  GESTIONNAIRE_PHARMACIE: { libelle: "Gestionnaire de pharmacie", droits: {
    tableau_bord: L, pharmacie: FULL, fournisseurs: L, rapports: LE } },
  TECHNICIEN_LABO: { libelle: "Technicien de laboratoire", droits: {
    tableau_bord: L, laboratoire: ["LIRE","CREER","MODIFIER","VALIDER"], rapports: LE } },
  RESPONSABLE_ADMIN: { libelle: "Responsable administratif", droits: {
    tableau_bord: L, personnel: ["LIRE","CREER","MODIFIER","ARCHIVER"], fournisseurs: L,
    partenaires_associations: ["LIRE","CREER","MODIFIER","ARCHIVER"], documents: FULL, rapports: LE } },
  GESTIONNAIRE_FINANCIER: { libelle: "Gestionnaire financier", droits: {
    tableau_bord: L, finances: ["LIRE","CREER","MODIFIER","EXPORTER"], fournisseurs: LCM, partenaires_associations: L, documents: LCM, rapports: LE } },
  RESPONSABLE_LOGISTIQUE: { libelle: "Responsable logistique", droits: {
    tableau_bord: L, batiments_equipements: FULL, fournisseurs: LCM, pharmacie: L, documents: LCM, rapports: LE } },
  CONTROLEUR: { libelle: "Contrôleur", droits: {
    tableau_bord: L, finances: LE, pharmacie: L, personnel: L, batiments_equipements: L, fournisseurs: L,
    partenaires_associations: L, programmes: L, rapports: LE, audit: LE } },
  LECTEUR: { libelle: "Lecteur autorisé", droits: { tableau_bord: L, rapports: L } },
};

export function droitsEffectifs(u: Utilisateur): Matrice {
  const out: Matrice = {};
  const ajouter = (m: Matrice) => { for (const k of Object.keys(m) as Module[]) out[k] = [...new Set([...(out[k] ?? []), ...(m[k] ?? [])])]; };
  for (const r of u.roles) { const d = ROLES[r]; if (d) ajouter(d.droits); }
  if (u.surcharges) ajouter(u.surcharges);
  return out;
}
export function peut(u: Utilisateur, module: Module, action: Action): boolean {
  return droitsEffectifs(u)[module]?.includes(action) ?? false;
}
export function exiger(u: Utilisateur, module: Module, action: Action): void {
  if (!peut(u, module, action)) throw new ErreurAcces(module, action);
}
export class ErreurAcces extends Error {
  constructor(public module: string, public action: string) { super(`Accès refusé : ${module}/${action}`); }
}
/** Modules contenant des données médicales : jamais accessibles aux rôles non médicaux. */
export const MODULES_MEDICAUX: Module[] = ["patients","consultations","maternite_vaccination","laboratoire","programmes_vih"];
