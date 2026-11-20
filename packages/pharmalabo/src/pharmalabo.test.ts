import { describe, it, expect } from "vitest";
import * as PH from "./pharmacie.js";
import * as LB from "./laboratoire.js";
import { ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z"); const now = d("2026-11-19");
const lots: PH.Lot[] = [
  { id: "A", produitId: "p", numero: "A1", peremption: d("2027-03-01") },
  { id: "B", produitId: "p", numero: "B1", peremption: d("2026-12-15") },
  { id: "C", produitId: "p", numero: "C1", peremption: d("2026-10-01") },
  { id: "D", produitId: "p", numero: "D1", peremption: null }];
const mv: PH.Mouvement[] = [{ lotId: "A", quantite: 100 }, { lotId: "B", quantite: 30 }, { lotId: "C", quantite: 50 }, { lotId: "D", quantite: 10 }, { lotId: "A", quantite: -20 }];

describe("stock", () => {
  it("dérivé des mouvements", () => { const s = PH.stockParLot(mv); expect(s.get("A")).toBe(80); expect(s.get("C")).toBe(50); });
  it("FEFO : prend le plus proche de la péremption, saute le périmé", () => {
    const r = PH.allouerFEFO("p", 50, lots, PH.stockParLot(mv), now);
    expect(r).toEqual({ ok: true, lots: [{ lotId: "B", numero: "B1", quantite: 30 }, { lotId: "A", numero: "A1", quantite: 20 }] });
  });
  it("lot sans date en dernier ; stock insuffisant ignore le périmé", () => {
    const r = PH.allouerFEFO("p", 125, lots, PH.stockParLot(mv), now);
    expect(r).toEqual({ ok: false, manque: 5, disponible: 120 });
  });
  it("quantité invalide", () => { expect(() => PH.allouerFEFO("p", 0, lots, new Map(), now)).toThrow(); expect(() => PH.allouerFEFO("p", 1.5, lots, new Map(), now)).toThrow(); });
});
describe("alertes", () => {
  const prod = [{ id: "p", designation: "Amoxicilline", seuilAlerte: 150, actif: true }];
  it("stock faible, péremption proche, périmé à retirer", () => {
    const a = PH.alertesStock(prod, lots, PH.stockParLot(mv), now); const types = a.map((x) => x.type);
    expect(types).toContain("STOCK_FAIBLE"); expect(types).toContain("PEREMPTION"); expect(types).toContain("PERIME");
  });
  it("rupture quand tout est périmé ou vide ; produit inactif ignoré", () => {
    expect(PH.alertesStock(prod, [lots[2]], PH.stockParLot([{ lotId: "C", quantite: 50 }]), now).map((x) => x.type)).toContain("RUPTURE");
    expect(PH.alertesStock([{ ...prod[0], actif: false }], lots, new Map(), now)).toEqual([]);
  });
  it("écarts d'inventaire", () => { expect(PH.ecartsInventaire([{ lotId: "A", compte: 78 }, { lotId: "B", compte: 30 }], PH.stockParLot(mv))).toEqual([{ lotId: "A", theorique: 80, compte: 78, ecart: -2 }]); });
});
describe("délivrance", () => {
  const mkDepot = () => { const w: unknown[] = []; const logs: string[] = [];
    const dep: PH.DepotPharmacie = { lots: async () => lots, mouvements: async () => mv, enregistrerDelivrance: async (x) => { w.push(x); return { id: "dl1" }; } };
    return { dep, w, logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } } }; };
  const req = { produitId: "p", lignePrescriptionId: "l", patientId: "pt", quantite: 5, quantitePrescrite: 10, dejaDelivre: 0, prixFcfa: 500 };
  it("délivrance OK : écrit les sorties FEFO et audite", async () => {
    const { dep, w, a, logs } = mkDepot(); const r = await PH.delivrer(dep, a, { id: "u", roles: ["GESTIONNAIRE_PHARMACIE"] }, req, now);
    expect(r.ok).toBe(true); expect(w).toHaveLength(1); expect(logs).toEqual(["DELIVRANCE"]);
  });
  it("refuse au-delà de la prescription", async () => { const { dep, a } = mkDepot(); await expect(PH.delivrer(dep, a, { id: "u", roles: ["GESTIONNAIRE_PHARMACIE"] }, { ...req, dejaDelivre: 8 }, now)).rejects.toThrow("supérieure"); });
  it("stock insuffisant : rien d'écrit", async () => { const { dep, a, w } = mkDepot(); const r = await PH.delivrer(dep, a, { id: "u", roles: ["GESTIONNAIRE_PHARMACIE"] }, { ...req, quantite: 500, quantitePrescrite: 500 }, now); expect(r.ok).toBe(false); expect(w).toHaveLength(0); });
  it("rôle sans droit pharmacie refusé", async () => { const { dep, a } = mkDepot(); await expect(PH.delivrer(dep, a, { id: "u", roles: ["AGENT_SANTE"] }, req, now)).rejects.toThrow(ErreurAcces); });
});
describe("laboratoire", () => {
  const mk = (statut: LB.Statut, resultat?: LB.Demande["resultat"]) => { let cur: LB.Demande = { id: "d", statut, resultat }; const logs: string[] = [];
    const dep: LB.DepotLabo = { demande: async () => cur, changerStatut: async (_i, v, e) => { cur = { ...cur, statut: v, resultat: e?.valeur ? { valeur: String(e.valeur), technicienId: String(e.technicienId) } : cur.resultat }; } };
    return { dep, get: () => cur, logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } } }; };
  const tech = { id: "t1", roles: ["TECHNICIEN_LABO"] };
  it("flux complet demande -> validée", async () => {
    const m = mk("DEMANDEE"); await LB.prelever(m.dep, m.a, tech, "d"); await LB.saisirResultat(m.dep, m.a, tech, "d", "12,5");
    expect(m.get().statut).toBe("RESULTAT_SAISI");
    await LB.validerResultat(m.dep, m.a, { id: "t2", roles: ["TECHNICIEN_LABO"] }, "d"); expect(m.get().statut).toBe("VALIDEE");
    expect(m.logs).toEqual(["LABO_PRELEVEMENT", "LABO_RESULTAT", "LABO_VALIDATION"]);
  });
  it("transitions interdites", async () => {
    const m = mk("DEMANDEE"); await expect(LB.saisirResultat(m.dep, m.a, tech, "d", "x")).rejects.toThrow("Transition interdite");
    const v = mk("VALIDEE"); await expect(LB.prelever(v.dep, v.a, tech, "d")).rejects.toThrow("Transition interdite");
  });
  it("validation par une autre personne que la saisie", async () => {
    const m = mk("RESULTAT_SAISI", { valeur: "1", technicienId: "t1" });
    await expect(LB.validerResultat(m.dep, m.a, tech, "d")).rejects.toThrow("autre personne");
  });
  it("droits : infirmier ne saisit pas, financier refusé", async () => {
    const m = mk("PRELEVEE"); await expect(LB.saisirResultat(m.dep, m.a, { id: "i", roles: ["INFIRMIER_CHEF"] }, "d", "1")).rejects.toThrow(ErreurAcces);
    await expect(LB.prelever(m.dep, m.a, { id: "f", roles: ["GESTIONNAIRE_FINANCIER"] }, "d")).rejects.toThrow(ErreurAcces);
  });
  it("hors référence et statistiques", () => {
    expect(LB.horsReference("12,5", 4, 11)).toBe(true); expect(LB.horsReference("positif", 4, 11)).toBeNull(); expect(LB.horsReference("5", 4, 11)).toBe(false);
    expect(LB.statistiques([{ examen: "GE", statut: "VALIDEE" }, { examen: "GE", statut: "VALIDEE" }, { examen: "GE", statut: "DEMANDEE" }])).toEqual({ GE: 2 });
  });
});
