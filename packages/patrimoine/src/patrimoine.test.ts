import { describe, it, expect } from "vitest";
import * as P from "./patrimoine.js";
import { ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z"); const now = d("2026-11-19");

describe("codes d'inventaire", () => {
  it("génère et valide, détecte l'altération", () => {
    const c = P.genererCode("NDM", 42); expect(c).toMatch(/^EQ-NDM-000042-[0-9A-Z]$/); expect(P.codeValide(c)).toBe(true);
    expect(P.codeValide(c.replace("000042", "000043"))).toBe(false); expect(P.codeValide("n'importe quoi")).toBe(false);
  });
  it("codes distincts", () => { expect(P.genererCode("NDM", 1)).not.toBe(P.genererCode("NDM", 2)); });
});
describe("équipements", () => {
  it("validation", () => {
    expect(P.validerEquipement({ designation: "" })).toContain("Désignation obligatoire");
    expect(P.validerEquipement({ designation: "x", valeurFcfa: -1 })).toContain("Valeur négative");
    expect(P.validerEquipement({ designation: "x", dateAcquisition: d("2026-01-01"), garantieFin: d("2025-01-01") })).toContain("Fin de garantie avant l'acquisition");
  });
  it("transitions d'état", () => { expect(P.transitionEtat("EN_PANNE", "EN_MAINTENANCE")).toBe(true); expect(P.transitionEtat("HORS_SERVICE", "FONCTIONNEL")).toBe(false); });
  it("amortissement linéaire plafonné à 0", () => {
    expect(Math.abs(P.valeurNette(1_000_000, d("2024-11-19"), 10, now) - 800_000)).toBeLessThan(1_000); expect(P.valeurNette(1_000_000, d("2000-01-01"), 10, now)).toBe(0);
  });
  it("coût de maintenance total et par équipement", () => {
    const m = [{ equipementId: "a", type: "CORRECTIVE" as const, date: now, coutFcfa: 10_000 }, { equipementId: "b", type: "PREVENTIVE" as const, date: now, coutFcfa: 5_000 }];
    expect(P.coutMaintenance(m)).toBe(15_000); expect(P.coutMaintenance(m, "a")).toBe(10_000);
  });
  it("alertes : panne, garantie proche, maintenance en retard ; hors service ignoré", () => {
    const eq: P.Equipement[] = [{ id: "1", designation: "Autoclave", etat: "EN_PANNE" }, { id: "2", designation: "Balance", etat: "FONCTIONNEL", garantieFin: d("2026-12-01") },
      { id: "3", designation: "Frigo", etat: "FONCTIONNEL" }, { id: "4", designation: "Vieux", etat: "HORS_SERVICE" }];
    const m: P.Maintenance[] = [{ equipementId: "3", type: "PREVENTIVE", date: d("2026-05-01"), prochaineDate: d("2026-11-01"), coutFcfa: 0 }, { equipementId: "4", type: "PREVENTIVE", date: d("2026-05-01"), prochaineDate: d("2026-11-01"), coutFcfa: 0 }];
    const a = P.alertesEquipements(eq, m, now); expect(a.map((x) => `${x.type}:${x.equipementId}`).sort()).toEqual(["GARANTIE:2", "MAINTENANCE:3", "PANNE:1"]);
    expect(a.find((x) => x.type === "MAINTENANCE")!.message).toContain("en retard");
  });
});
describe("bâtiments", () => {
  it("bâtiments à réhabiliter triés par gravité", () => {
    expect(P.batimentsATravaux([{ id: "1", nom: "A", etat: "BON" }, { id: "2", nom: "B", etat: "DEGRADE" }, { id: "3", nom: "C", etat: "CRITIQUE" }]).map((b) => b.nom)).toEqual(["C", "B"]);
  });
  it("budget de réhabilitation par statut, annulé exclu", () => {
    expect(P.budgetReabilitation([{ batimentId: "a", budgetFcfa: 100, statut: "PLANIFIE" }, { batimentId: "a", budgetFcfa: 50, statut: "EN_COURS" }, { batimentId: "a", budgetFcfa: 30, statut: "TERMINE" }, { batimentId: "a", budgetFcfa: 999, statut: "ANNULE" }]))
      .toEqual({ aFinancer: 100, enCours: 50, realise: 30 });
  });
  it("validation des travaux", () => { expect(P.validerTravaux({ description: "", budgetFcfa: -5, dateDebut: d("2026-02-01"), dateFin: d("2026-01-01") })).toHaveLength(3); });
});
describe("service", () => {
  const mk = (etat: P.Etat | null = "FONCTIONNEL") => { const logs: string[] = []; let cur = etat; const w: unknown[] = [];
    const dep: P.DepotPatrimoine = { etat: async () => cur, changerEtat: async (_i, v) => { cur = v; }, prochaineSequence: async () => 7, creer: async (e) => { w.push(e); return { id: "e1" }; } };
    return { dep, logs, w, get: () => cur, a: { log: async (e: { action: string }) => { logs.push(e.action); } } }; };
  const log = { id: "u", roles: ["RESPONSABLE_LOGISTIQUE"] };
  it("enregistre avec code QR valide et audit", async () => {
    const m = mk(); const r = await P.enregistrerEquipement(m.dep, m.a, log, { id: "s", code: "NDM" }, { designation: "Réfrigérateur" });
    expect(r.ok && P.codeValide(r.codeQr)).toBe(true); expect(m.logs).toEqual(["EQUIPEMENT_CREE"]);
  });
  it("refuse les données invalides et les rôles non autorisés", async () => {
    const m = mk(); expect((await P.enregistrerEquipement(m.dep, m.a, log, { id: "s", code: "NDM" }, { designation: "" })).ok).toBe(false);
    await expect(P.enregistrerEquipement(m.dep, m.a, { id: "u", roles: ["AGENT_SANTE"] }, { id: "s", code: "NDM" }, { designation: "x" })).rejects.toThrow(ErreurAcces);
  });
  it("panne -> maintenance -> fonctionnel ; transition interdite refusée", async () => {
    const m = mk("EN_PANNE"); await P.changerEtatEquipement(m.dep, m.a, log, "e", "EN_MAINTENANCE"); await P.changerEtatEquipement(m.dep, m.a, log, "e", "FONCTIONNEL");
    expect(m.get()).toBe("FONCTIONNEL"); const h = mk("HORS_SERVICE"); await expect(P.changerEtatEquipement(h.dep, h.a, log, "e", "FONCTIONNEL")).rejects.toThrow("Transition interdite");
  });
  it("la mise hors service exige le droit de valider", async () => {
    const m = mk(); await expect(P.changerEtatEquipement(m.dep, m.a, { id: "u", roles: ["INFIRMIER_CHEF"] }, "e", "HORS_SERVICE")).rejects.toThrow(ErreurAcces);
    await P.changerEtatEquipement(m.dep, m.a, log, "e", "HORS_SERVICE"); expect(m.get()).toBe("HORS_SERVICE");
  });
});
