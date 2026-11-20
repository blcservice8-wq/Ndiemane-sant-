import { exiger, type Utilisateur } from "../../auth/src/rbac.js";
const JOUR = 86_400_000;

// ---------- Commandes ----------
export type StatutCommande = "BROUILLON" | "VALIDEE" | "ENVOYEE" | "PARTIELLE" | "LIVREE" | "ANNULEE";
const TRANSITIONS: Record<StatutCommande, StatutCommande[]> = { BROUILLON: ["VALIDEE", "ANNULEE"], VALIDEE: ["ENVOYEE", "ANNULEE"],
  ENVOYEE: ["PARTIELLE", "LIVREE", "ANNULEE"], PARTIELLE: ["PARTIELLE", "LIVREE"], LIVREE: [], ANNULEE: [] };
export const transitionCommande = (de: StatutCommande, vers: StatutCommande) => TRANSITIONS[de].includes(vers);
export const formaterBC = (codeSite: string, annee: number, seq: number) => `BC-${codeSite}-${annee}-${String(seq).padStart(4, "0")}`;

export type LigneCommande = { produitId: string; quantite: number; prixUnitaireFcfa: number };
export const totalCommande = (l: LigneCommande[]) => l.reduce((s, x) => s + x.quantite * x.prixUnitaireFcfa, 0);
export function validerLignes(l: LigneCommande[]): string[] {
  const e: string[] = []; if (!l.length) e.push("Commande sans ligne");
  l.forEach((x, i) => { if (!Number.isInteger(x.quantite) || x.quantite <= 0) e.push(`Ligne ${i + 1} : quantité invalide`); if (x.prixUnitaireFcfa < 0) e.push(`Ligne ${i + 1} : prix négatif`); });
  const ids = l.map((x) => x.produitId); if (new Set(ids).size !== ids.length) e.push("Produit en double dans la commande");
  return e;
}

// ---------- Livraisons ----------
export type Reception = { produitId: string; quantiteRecue: number };
export function recevoir(lignes: LigneCommande[], dejaRecu: Reception[], nouvelle: Reception[]) {
  const erreurs: string[] = [];
  const recu = new Map<string, number>(); for (const r of dejaRecu) recu.set(r.produitId, (recu.get(r.produitId) ?? 0) + r.quantiteRecue);
  for (const n of nouvelle) {
    const l = lignes.find((x) => x.produitId === n.produitId);
    if (!l) { erreurs.push(`Produit ${n.produitId} absent de la commande`); continue; }
    if (!Number.isInteger(n.quantiteRecue) || n.quantiteRecue <= 0) erreurs.push(`Quantité reçue invalide pour ${n.produitId}`);
    else if ((recu.get(n.produitId) ?? 0) + n.quantiteRecue > l.quantite) erreurs.push(`Réception supérieure à la commande pour ${n.produitId}`);
    else recu.set(n.produitId, (recu.get(n.produitId) ?? 0) + n.quantiteRecue);
  }
  if (erreurs.length) return { ok: false as const, erreurs };
  const complet = lignes.every((l) => (recu.get(l.produitId) ?? 0) === l.quantite);
  return { ok: true as const, statut: (complet ? "LIVREE" : "PARTIELLE") as StatutCommande, recu };
}

// ---------- Rapprochement facture / commande / livraison ----------
export function rapprocherFacture(lignes: LigneCommande[], recu: Map<string, number>, montantFacture: number, tolerancePct = 0) {
  const attendu = lignes.reduce((s, l) => s + (recu.get(l.produitId) ?? 0) * l.prixUnitaireFcfa, 0);
  const ecart = montantFacture - attendu; const tol = (attendu * tolerancePct) / 100;
  return { attendu, ecart, conforme: Math.abs(ecart) <= tol, motif: ecart > tol ? "Facture supérieure aux quantités reçues" : ecart < -tol ? "Facture inférieure aux quantités reçues" : null };
}

// ---------- Dettes ----------
export type Facture = { fournisseurId: string; numero: string; montantFcfa: number; payeFcfa: number; echeance: Date | null };
export const resteAPayer = (f: Facture) => f.montantFcfa - f.payeFcfa;
export function dettes(factures: Facture[], maintenant: Date) {
  const impayees = factures.filter((f) => resteAPayer(f) > 0);
  const age = (f: Facture) => f.echeance ? Math.floor((maintenant.getTime() - f.echeance.getTime()) / JOUR) : null;
  const parFournisseur = new Map<string, number>(); for (const f of impayees) parFournisseur.set(f.fournisseurId, (parFournisseur.get(f.fournisseurId) ?? 0) + resteAPayer(f));
  return { total: impayees.reduce((s, f) => s + resteAPayer(f), 0), enRetard: impayees.filter((f) => (age(f) ?? -1) > 0).map((f) => ({ ...f, joursRetard: age(f)! })).sort((a, b) => b.joursRetard - a.joursRetard), parFournisseur };
}
export function enregistrerPaiement(f: Facture, montant: number): Facture {
  if (!(montant > 0)) throw new Error("Montant invalide"); if (montant > resteAPayer(f)) throw new Error("Paiement supérieur au reste à payer");
  return { ...f, payeFcfa: f.payeFcfa + montant };
}

// ---------- Évaluation et doublons ----------
export type Evaluation = { delai: number; qualite: number; prix: number; conformite: number }; // notes 1..5
export function noteFournisseur(e: Evaluation[]): number | null {
  if (!e.length) return null; const t = e.reduce((s, x) => s + (x.delai + x.qualite + x.prix + x.conformite) / 4, 0); return Math.round((t / e.length) * 10) / 10;
}
export const validerEvaluation = (e: Evaluation) => Object.values(e).every((v) => Number.isInteger(v) && v >= 1 && v <= 5) ? [] : ["Notes de 1 à 5 requises"];
export const normaliserNom = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(sarl|sa|sas|ets|etablissements)\b/g, "").replace(/[^a-z0-9]/g, "");
export const estDoublonFournisseur = (a: string, existants: string[]) => existants.some((e) => normaliserNom(e) === normaliserNom(a));

// ---------- Service ----------
export interface DepotCommandes { commande(id: string): Promise<{ statut: StatutCommande; total: number } | null>; changerStatut(id: string, vers: StatutCommande, validePar?: string): Promise<void>; }
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string; details?: unknown }): Promise<void> }
export async function avancerCommande(d: DepotCommandes, a: Audit, u: Utilisateur, id: string, vers: StatutCommande) {
  exiger(u, "fournisseurs", vers === "VALIDEE" || vers === "ANNULEE" ? "VALIDER" : "MODIFIER"); // valider ou annuler un achat est une décision réservée aux valideurs
  const c = await d.commande(id); if (!c) throw new Error("Commande introuvable");
  if (!transitionCommande(c.statut, vers)) throw new Error(`Transition interdite : ${c.statut} -> ${vers}`);
  await d.changerStatut(id, vers, vers === "VALIDEE" ? u.id : undefined);
  await a.log({ action: `COMMANDE_${vers}`, utilisateurId: u.id, entite: "Commande", entiteId: id, details: { total: c.total } });
}
