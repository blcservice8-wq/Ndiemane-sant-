import { peut, type Utilisateur, type Module } from "../../auth/src/rbac.js";
import { calculer, masquerPetitsEffectifs, type DefIndicateur, type Jeux, type Periode } from "./indicateurs.js";

export type TypeRapport = "SANITAIRE" | "FINANCIER" | "PHARMACIE" | "LABORATOIRE" | "RH" | "PATRIMONIAL" | "COMMUNAUTAIRE";
/** Module source requis pour produire chaque type de rapport. */
export const MODULE_SOURCE: Record<TypeRapport, Module> = { SANITAIRE: "consultations", FINANCIER: "finances", PHARMACIE: "pharmacie", LABORATOIRE: "laboratoire", RH: "personnel", PATRIMONIAL: "batiments_equipements", COMMUNAUTAIRE: "partenaires_associations" };

export type Tableau = { titre: string; colonnes: string[]; lignes: (string | number | null)[][] };
export type Rapport = { titre: string; type: TypeRapport; periode: Periode; genereLe: Date; auteur: string; indicateurs: { code: string; libelle: string; valeur: number | string | null }[]; tableaux: Tableau[]; externe: boolean };

export function genererRapport(u: Utilisateur, type: TypeRapport, titre: string, defs: DefIndicateur[], jeux: Jeux, p: Periode, opts: { externe?: boolean; seuilMasquage?: number; tableaux?: Tableau[]; maintenant?: Date } = {}): Rapport {
  if (!peut(u, "rapports", "LIRE") || !peut(u, MODULE_SOURCE[type], "LIRE")) throw new Error(`Accès refusé : rapport ${type}`);
  const vals = calculer(defs, jeux, p); const seuil = opts.seuilMasquage ?? 5;
  return { titre, type, periode: p, genereLe: opts.maintenant ?? new Date(), auteur: u.id, externe: !!opts.externe, tableaux: opts.tableaux ?? [],
    indicateurs: defs.map((d) => ({ code: d.code, libelle: d.libelle, valeur: opts.externe && d.op !== "RATIO" ? masquerPetitsEffectifs(vals[d.code], seuil) : vals[d.code] })) };
}
export const peutExporter = (u: Utilisateur) => peut(u, "rapports", "EXPORTER");
