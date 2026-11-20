import { exiger, type Utilisateur } from "../../auth/src/rbac.js";
const JOUR = 86_400_000;

export type Mouvement = { lotId: string; quantite: number }; // signé : + entrée, - sortie
export type Lot = { id: string; produitId: string; numero: string; peremption: Date | null };

/** Le stock est toujours DÉRIVÉ des mouvements (additif, sans conflit en synchronisation). */
export function stockParLot(mouvements: Mouvement[]): Map<string, number> {
  const m = new Map<string, number>(); for (const x of mouvements) m.set(x.lotId, (m.get(x.lotId) ?? 0) + x.quantite); return m;
}
export const estPerime = (l: Lot, maintenant: Date) => !!l.peremption && l.peremption.getTime() < maintenant.getTime();

export type AllocationLot = { lotId: string; numero: string; quantite: number };
export type ResultatAllocation = { ok: true; lots: AllocationLot[] } | { ok: false; manque: number; disponible: number };
/** FEFO : premier périmé, premier sorti. Les lots périmés ne sont jamais délivrés. */
export function allouerFEFO(produitId: string, quantite: number, lots: Lot[], stock: Map<string, number>, maintenant: Date): ResultatAllocation {
  const dispos = lots.filter((l) => l.produitId === produitId && !estPerime(l, maintenant) && (stock.get(l.id) ?? 0) > 0)
    .sort((a, b) => (a.peremption?.getTime() ?? Infinity) - (b.peremption?.getTime() ?? Infinity));
  const total = dispos.reduce((s, l) => s + (stock.get(l.id) ?? 0), 0);
  if (quantite <= 0 || !Number.isInteger(quantite)) throw new Error("Quantité invalide");
  if (total < quantite) return { ok: false, manque: quantite - total, disponible: total };
  const lotsAlloues: AllocationLot[] = []; let reste = quantite;
  for (const l of dispos) { if (!reste) break; const q = Math.min(reste, stock.get(l.id)!); lotsAlloues.push({ lotId: l.id, numero: l.numero, quantite: q }); reste -= q; }
  return { ok: true, lots: lotsAlloues };
}

export type Produit = { id: string; designation: string; seuilAlerte: number; actif: boolean };
export type AlerteStock = { type: "RUPTURE" | "STOCK_FAIBLE" | "PEREMPTION" | "PERIME"; produitId: string; message: string };
export function alertesStock(produits: Produit[], lots: Lot[], stock: Map<string, number>, maintenant: Date, joursPreavis = 90): AlerteStock[] {
  const out: AlerteStock[] = [];
  for (const p of produits.filter((x) => x.actif)) {
    const ls = lots.filter((l) => l.produitId === p.id);
    const utilisable = ls.filter((l) => !estPerime(l, maintenant)).reduce((s, l) => s + (stock.get(l.id) ?? 0), 0);
    if (utilisable <= 0) out.push({ type: "RUPTURE", produitId: p.id, message: `${p.designation} : rupture` });
    else if (utilisable <= p.seuilAlerte) out.push({ type: "STOCK_FAIBLE", produitId: p.id, message: `${p.designation} : ${utilisable} restant(s), seuil ${p.seuilAlerte}` });
    for (const l of ls) {
      if (!(stock.get(l.id) ?? 0) || !l.peremption) continue;
      if (estPerime(l, maintenant)) out.push({ type: "PERIME", produitId: p.id, message: `${p.designation} lot ${l.numero} périmé : à retirer` });
      else if (l.peremption.getTime() - maintenant.getTime() <= joursPreavis * JOUR) out.push({ type: "PEREMPTION", produitId: p.id, message: `${p.designation} lot ${l.numero} expire le ${l.peremption.toISOString().slice(0, 10)}` });
    }
  }
  return out;
}

export type LigneInventaire = { lotId: string; compte: number };
/** Écarts = comptage physique - stock théorique. Chaque écart non nul devient un mouvement d'ajustement. */
export function ecartsInventaire(lignes: LigneInventaire[], stock: Map<string, number>) {
  return lignes.map((l) => ({ lotId: l.lotId, theorique: stock.get(l.lotId) ?? 0, compte: l.compte, ecart: l.compte - (stock.get(l.lotId) ?? 0) })).filter((e) => e.ecart !== 0);
}

// ---------- Service de délivrance ----------
export interface DepotPharmacie {
  lots(produitId: string): Promise<Lot[]>;
  mouvements(produitId: string): Promise<Mouvement[]>;
  /** Doit écrire tous les mouvements dans UNE transaction. */
  enregistrerDelivrance(d: { lignePrescriptionId: string; patientId: string; delivreurId: string; sorties: AllocationLot[]; prixFcfa: number }): Promise<{ id: string }>;
}
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string; details?: unknown }): Promise<void> }
export type ResultatDelivrance = { ok: true; id: string; lots: AllocationLot[] } | { ok: false; raison: "STOCK_INSUFFISANT"; manque: number; disponible: number };

export async function delivrer(d: DepotPharmacie, a: Audit, u: Utilisateur,
  req: { produitId: string; lignePrescriptionId: string; patientId: string; quantite: number; quantitePrescrite: number; dejaDelivre: number; prixFcfa: number }, maintenant = new Date()): Promise<ResultatDelivrance> {
  exiger(u, "pharmacie", "MODIFIER");
  if (req.dejaDelivre + req.quantite > req.quantitePrescrite) throw new Error("Quantité supérieure à la prescription");
  const alloc = allouerFEFO(req.produitId, req.quantite, await d.lots(req.produitId), stockParLot(await d.mouvements(req.produitId)), maintenant);
  if (!alloc.ok) { await a.log({ action: "DELIVRANCE_REFUSEE_STOCK", utilisateurId: u.id }); return { ok: false, raison: "STOCK_INSUFFISANT", manque: alloc.manque, disponible: alloc.disponible }; }
  const { id } = await d.enregistrerDelivrance({ lignePrescriptionId: req.lignePrescriptionId, patientId: req.patientId, delivreurId: u.id, sorties: alloc.lots, prixFcfa: req.prixFcfa });
  await a.log({ action: "DELIVRANCE", utilisateurId: u.id, entite: "Delivrance", entiteId: id, details: alloc.lots });
  return { ok: true, id, lots: alloc.lots };
}
