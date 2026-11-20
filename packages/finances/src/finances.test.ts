import { describe, it, expect } from "vitest";
import * as F from "./finances.js";
import { ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z");

describe("journal de caisse", () => {
  it("soldes cumulés", () => {
    let j: F.LigneCaisse[] = []; j = F.ajouterLigne(j, { id: "1", date: d("2026-11-01"), libelle: "Consultations", entreeFcfa: 10000 }); j = F.ajouterLigne(j, { id: "2", date: d("2026-11-02"), libelle: "Achat", sortieFcfa: 3000 });
    expect(F.soldeCaisse(j)).toBe(7000);
  });
  it("refuse montant invalide, double sens, libellé vide, solde négatif, date antérieure", () => {
    const j = F.ajouterLigne([], { id: "1", date: d("2026-11-05"), libelle: "x", entreeFcfa: 1000 });
    expect(() => F.ajouterLigne(j, { id: "2", date: d("2026-11-06"), libelle: "x", entreeFcfa: 1.5 })).toThrow("invalide");
    expect(() => F.ajouterLigne(j, { id: "2", date: d("2026-11-06"), libelle: "x", entreeFcfa: 5, sortieFcfa: 5 })).toThrow("soit une entrée");
    expect(() => F.ajouterLigne(j, { id: "2", date: d("2026-11-06"), libelle: " ", sortieFcfa: 5 })).toThrow("Libellé");
    expect(() => F.ajouterLigne(j, { id: "2", date: d("2026-11-06"), libelle: "x", sortieFcfa: 2000 })).toThrow("insuffisant");
    expect(() => F.ajouterLigne(j, { id: "2", date: d("2026-11-01"), libelle: "x", entreeFcfa: 5 })).toThrow("antérieure");
  });
  it("le journal d'origine n'est jamais muté", () => { const j = F.ajouterLigne([], { id: "1", date: d("2026-11-01"), libelle: "x", entreeFcfa: 10 }); const copie = JSON.stringify(j); F.ajouterLigne(j, { id: "2", date: d("2026-11-02"), libelle: "y", entreeFcfa: 5 }); expect(JSON.stringify(j)).toBe(copie); });
  it("correction par écriture inverse, une seule fois, jamais sur une correction", () => {
    let j = F.ajouterLigne([], { id: "1", date: d("2026-11-01"), libelle: "Recette", entreeFcfa: 10000 });
    j = F.contrepasser(j, "1", "2", d("2026-11-03"), "erreur de saisie"); expect(F.soldeCaisse(j)).toBe(0); expect(j).toHaveLength(2);
    expect(() => F.contrepasser(j, "1", "3", d("2026-11-04"), "bis")).toThrow("déjà corrigée"); expect(() => F.contrepasser(j, "2", "3", d("2026-11-04"), "x")).toThrow("ne peut pas");
    expect(() => F.contrepasser(j, "9", "3", d("2026-11-04"), "x")).toThrow("introuvable"); expect(() => F.contrepasser(j, "1", "3", d("2026-11-04"), " ")).toThrow();
  });
  it("clôture : écart de caisse", () => { const j = F.ajouterLigne([], { id: "1", date: d("2026-11-01"), libelle: "x", entreeFcfa: 10000 }); expect(F.ecartCloture(j, 9500)).toEqual({ theorique: 10000, compte: 9500, ecart: -500 }); });
});
describe("recettes et budget", () => {
  it("totaux par type sur période", () => { expect(F.totauxRecettes([{ type: "ACTES", montantFcfa: 100, date: d("2026-11-02") }, { type: "DON", montantFcfa: 50, date: d("2026-11-03") }, { type: "ACTES", montantFcfa: 70, date: d("2026-10-01") }], d("2026-11-01"), d("2026-11-30"))).toEqual({ total: 150, parType: { ACTES: 100, DON: 50 } }); });
  it("exécution budgétaire", () => {
    expect(F.executionBudget(1000, [{ budgetId: "b", montantFcfa: 400, actif: true }, { budgetId: "b", montantFcfa: 300, actif: false }], [{ budgetId: "b", montantFcfa: 150, statut: "PAYEE" }, { budgetId: "b", montantFcfa: 99, statut: "VALIDEE" }]))
      .toEqual({ budget: 1000, engage: 400, paye: 150, disponible: 600, tauxEngagement: 40, tauxExecution: 15 });
    expect(F.executionBudget(0, [], []).tauxExecution).toBeNull();
  });
  it("trésorerie", () => { expect(F.tresorerie(500, 200, 100, 150, 20)).toEqual({ soldeInitial: 100, entrees: 500, sorties: 200, soldeFinal: 400, apresDettes: 270 }); });
});
describe("circuit de dépense", () => {
  const dep = (o: Partial<F.Depense> = {}): F.Depense => ({ id: "d", libelle: "Gasoil", montantFcfa: 50000, statut: "DEMANDEE", demandeurId: "fin", ...o });
  const ctx = { budgetDisponibleFcfa: 100000, soldeCaisseFcfa: 200000, seuilResponsableFcfa: 100000 };
  const resp = { id: "resp", roles: ["RESPONSABLE_POSTE"] }, fin = { id: "fin", roles: ["GESTIONNAIRE_FINANCIER"] };
  it("transitions interdites", () => { expect(F.controlerTransition(dep(), "PAYEE", fin, ctx)).toEqual(["Transition interdite : DEMANDEE -> PAYEE"]); expect(F.controlerTransition(dep({ statut: "PAYEE" }), "REJETEE", resp, ctx)[0]).toContain("interdite"); });
  it("engagement limité au budget disponible", () => { expect(F.controlerTransition(dep({ montantFcfa: 150000 }), "ENGAGEE", fin, ctx)).toContain("Budget disponible insuffisant"); expect(F.controlerTransition(dep(), "ENGAGEE", fin, ctx)).toEqual([]); });
  it("séparation des tâches et seuil", () => {
    expect(F.controlerTransition(dep({ statut: "ENGAGEE", demandeurId: "resp" }), "VALIDEE", resp, ctx)).toContain("Le demandeur ne peut pas valider sa propre dépense");
    expect(F.controlerTransition(dep({ statut: "ENGAGEE", montantFcfa: 500000 }), "VALIDEE", { id: "x", roles: ["CONTROLEUR"] }, { ...ctx, seuilResponsableFcfa: 100000 })[0]).toContain("seuil");
  });
  it("paiement : justificatif, validation, solde", () => {
    expect(F.controlerTransition(dep({ statut: "VALIDEE", validateurId: "resp" }), "PAYEE", fin, ctx)).toContain("Justificatif obligatoire avant paiement");
    expect(F.controlerTransition(dep({ statut: "VALIDEE", justificatifId: "j" }), "PAYEE", fin, ctx)).toContain("Dépense non validée");
    expect(F.controlerTransition(dep({ statut: "VALIDEE", validateurId: "resp", justificatifId: "j" }), "PAYEE", fin, { ...ctx, soldeCaisseFcfa: 10 })).toContain("Solde de caisse insuffisant");
    expect(F.controlerTransition(dep({ statut: "VALIDEE", validateurId: "resp", justificatifId: "j" }), "PAYEE", fin, ctx)).toEqual([]);
  });
  const mk = (initial: F.Depense) => { let cur = initial; const logs: string[] = []; const caisse: unknown[] = [];
    const depot: F.DepotFinance = { depense: async () => cur, contexte: async () => ctx, appliquer: async (_i, v, val, l) => { cur = { ...cur, statut: v, validateurId: val ?? cur.validateurId }; if (l) caisse.push(l); } };
    return { depot, logs, caisse, get: () => cur, a: { log: async (e: { action: string }) => { logs.push(e.action); } } }; };
  it("parcours complet : le paiement écrit la ligne de caisse", async () => {
    const m = mk(dep({ justificatifId: "j" }));
    expect((await F.avancerDepense(m.depot, m.a, fin, "d", "ENGAGEE")).ok).toBe(true);
    expect((await F.avancerDepense(m.depot, m.a, resp, "d", "VALIDEE")).ok).toBe(true);
    expect((await F.avancerDepense(m.depot, m.a, fin, "d", "PAYEE")).ok).toBe(true);
    expect(m.get().statut).toBe("PAYEE"); expect(m.caisse).toEqual([{ libelle: "Gasoil", sortieFcfa: 50000, refId: "d" }]); expect(m.logs).toEqual(["DEPENSE_ENGAGEE", "DEPENSE_VALIDEE", "DEPENSE_PAYEE"]);
  });
  it("règle refusée : rien d'écrit, refus audité", async () => {
    const m = mk(dep({ statut: "VALIDEE", validateurId: "resp" })); const r = await F.avancerDepense(m.depot, m.a, fin, "d", "PAYEE");
    expect(r.ok).toBe(false); expect(m.caisse).toHaveLength(0); expect(m.logs).toEqual(["DEPENSE_REFUSEE"]);
  });
  it("droits : le financier ne valide pas, l'agent n'a aucun accès", async () => {
    const m = mk(dep({ statut: "ENGAGEE", demandeurId: "autre" }));
    await expect(F.avancerDepense(m.depot, m.a, fin, "d", "VALIDEE")).rejects.toThrow(ErreurAcces); await expect(F.avancerDepense(m.depot, m.a, { id: "a", roles: ["AGENT_SANTE"] }, "d", "PAYEE")).rejects.toThrow(ErreurAcces);
    expect(F.peutVoirFinances({ id: "a", roles: ["AGENT_SANTE"] })).toBe(false);
  });
});
