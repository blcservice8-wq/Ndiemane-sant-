import { describe, it, expect, vi } from "vitest";
import { construireTableauDeBord, periodeDepuis, tauxRealisation } from "./dashboard.js";
import type { DepotStats } from "./types.js";

const depot = (): DepotStats => ({
  sanitaires: vi.fn(async () => ({ patientsEnregistres: 10, consultationsJour: 2, consultationsMois: 8, consultationsAnnee: 40, maternite: null, vaccinations: 3, analysesLabo: 4 })),
  pharmacie: vi.fn(async () => ({ produitsActifs: 20, ruptures: [{ id: "1", designation: "Paracétamol" }], stocksFaibles: 2, peremptionsProches: 1 })),
  personnel: vi.fn(async () => ({ effectifActif: 6, enConge: 1 })),
  equipements: vi.fn(async () => ({ fonctionnels: 9, enPanne: 2, batimentsATravaux: 1 })),
  finances: vi.fn(async () => ({ recettesMois: 500000, depensesMois: 320000, depensesEnAttenteValidation: 2 })),
  objectifs: vi.fn(async () => [{ indicateur: "Couverture vaccinale", cible: 80, realise: 60 }, { indicateur: "Sans cible", cible: 0, realise: 5 }]),
  alertes: vi.fn(async () => [
    { type: "PEREMPTION", severite: "INFO" as const, message: "Lot proche" },
    { type: "PANNE", severite: "CRITIQUE" as const, message: "Balance en panne" },
    { type: "ECHEANCE", severite: "ATTENTION" as const, message: "Facture due" }]),
});
const u = (...roles: string[]) => ({ id: "u", roles });
const t = new Date("2026-11-19T10:00:00Z");

describe("tableau de bord", () => {
  it("périodes jour / mois / année", () => {
    const p = periodeDepuis(t);
    expect(p.jourDebut.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    expect(p.moisDebut.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(p.anneeDebut.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
  it("taux de réalisation, null sans cible", () => { expect(tauxRealisation(80, 60)).toBe(75); expect(tauxRealisation(0, 5)).toBeNull(); });
  it("responsable : vue complète, solde calculé, alertes triées par gravité", async () => {
    const r = await construireTableauDeBord(depot(), u("RESPONSABLE_POSTE"), t);
    expect(r.finances?.solde).toBe(180000);
    expect(r.objectifs?.[0].taux).toBe(75);
    expect(r.alertes.map((a) => a.severite)).toEqual(["CRITIQUE", "ATTENTION", "INFO"]);
    expect(r.sanitaire?.maternite).toBeNull();
  });
  it("financier : voit les finances, pas le sanitaire (et la base n'est pas interrogée)", async () => {
    const d = depot(); const r = await construireTableauDeBord(d, u("GESTIONNAIRE_FINANCIER"), t);
    expect(r.finances).toBeDefined(); expect(r.sanitaire).toBeUndefined();
    expect(d.sanitaires).not.toHaveBeenCalled(); expect(d.pharmacie).not.toHaveBeenCalled();
  });
  it("pharmacien : alertes de stock mais pas de panne ni d'échéance financière", async () => {
    const r = await construireTableauDeBord(depot(), u("GESTIONNAIRE_PHARMACIE"), t);
    expect(r.alertes.map((a) => a.type)).toEqual(["PEREMPTION"]);
    expect(r.finances).toBeUndefined();
  });
  it("lecteur : sections vides, accès refusé sans droit tableau_bord", async () => {
    const r = await construireTableauDeBord(depot(), u("LECTEUR"), t);
    expect(r.sanitaire).toBeUndefined(); expect(r.pharmacie).toBeUndefined();
    await expect(construireTableauDeBord(depot(), u("INCONNU"), t)).rejects.toThrow("Accès refusé");
  });
});
