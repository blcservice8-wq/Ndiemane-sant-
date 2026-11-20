import { describe, it, expect } from "vitest";
import * as P from "./personnel.js";
import { ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z");
const dt = (s: string) => new Date(s + "Z");

describe("fiche", () => {
  it("validation", () => {
    expect(P.validerFiche({ nom: "", prenom: "A", fonction: "IDE" })).toContain("Nom obligatoire");
    expect(P.validerFiche({ nom: "S", prenom: "A", fonction: "IDE", telephone: "+221 77 000 00 00" })).toEqual([]);
    expect(P.validerFiche({ nom: "S", prenom: "A", fonction: "IDE", dateEmbauche: d("2999-01-01") })).toContain("Date d'embauche dans le futur");
  });
});
describe("contrats", () => {
  it("chevauchement refusé, contrat ouvert géré", () => {
    const ex = [{ debut: d("2025-01-01"), fin: d("2025-12-31") }];
    expect(P.validerNouveauContrat({ debut: d("2025-06-01"), fin: d("2026-06-01") }, ex)).toContain("Chevauchement avec un contrat existant");
    expect(P.validerNouveauContrat({ debut: d("2026-01-01"), fin: null }, ex)).toEqual([]);
    expect(P.validerNouveauContrat({ debut: d("2026-01-01"), fin: d("2025-01-01") }, [])).toContain("La fin précède le début");
    expect(P.validerNouveauContrat({ debut: d("2025-12-31"), fin: null }, ex)).toHaveLength(1);
  });
  it("contrats expirants triés, ignore passés et sans fin", () => {
    const r = P.contratsExpirants([{ personnelId: "a", fin: d("2026-12-31") }, { personnelId: "b", fin: d("2026-12-01") },
      { personnelId: "c", fin: d("2026-01-01") }, { personnelId: "d", fin: null }, { personnelId: "e", fin: d("2027-06-01") }], d("2026-11-19"), 60);
    expect(r.map((x) => x.personnelId)).toEqual(["b", "a"]); expect(r[0].joursRestants).toBe(12);
  });
});
describe("congés", () => {
  it("jours ouvrés lun-ven, fériés exclus", () => {
    expect(P.joursOuvres(d("2026-11-16"), d("2026-11-22"))).toBe(5);
    expect(P.joursOuvres(d("2026-11-16"), d("2026-11-22"), [d("2026-11-17")])).toBe(4);
    expect(P.joursOuvres(d("2026-11-21"), d("2026-11-22"))).toBe(0);
  });
  it("refuse chevauchement et solde dépassé, ignore les congés non approuvés", () => {
    const ex = [{ debut: d("2026-03-02"), fin: d("2026-03-13"), type: "ANNUEL", approuve: true }, { debut: d("2026-07-01"), fin: d("2026-07-10"), type: "ANNUEL", approuve: false }];
    expect(P.validerDemandeConge({ debut: d("2026-03-10"), fin: d("2026-03-12"), type: "MALADIE", approuve: false }, ex, 30)).toContain("Chevauchement avec un congé approuvé");
    expect(P.validerDemandeConge({ debut: d("2026-07-01"), fin: d("2026-07-10"), type: "ANNUEL", approuve: false }, ex, 30)).toEqual([]);
    const r = P.validerDemandeConge({ debut: d("2026-09-01"), fin: d("2026-09-30"), type: "ANNUEL", approuve: false }, ex, 30);
    expect(r[0]).toContain("Solde de congés annuel insuffisant (reste 20 j)");
  });
  it("le congé maladie ne consomme pas le solde annuel", () => {
    expect(P.validerDemandeConge({ debut: d("2026-09-01"), fin: d("2026-09-30"), type: "MALADIE", approuve: false }, [], 5)).toEqual([]);
  });
});
describe("présences", () => {
  it("taux et absences injustifiées", () => {
    const p = [{ date: d("2026-11-02"), present: true }, { date: d("2026-11-03"), present: false }, { date: d("2026-11-04"), present: false, motifAbsence: "Maladie" }, { date: d("2026-11-05"), present: true }];
    expect(P.tauxPresence(p)).toBe(50); expect(P.absencesInjustifiees(p)).toBe(1); expect(P.tauxPresence([])).toBeNull();
  });
});
describe("gardes", () => {
  const ex = [{ personnelId: "a", debut: dt("2026-11-10T20:00:00"), fin: dt("2026-11-11T08:00:00") }];
  it("chevauchement, repos minimal, congé", () => {
    expect(P.validerGarde({ personnelId: "a", debut: dt("2026-11-11T06:00:00"), fin: dt("2026-11-11T14:00:00") }, ex, 12)).toContain("Chevauchement avec une autre garde du même agent");
    expect(P.validerGarde({ personnelId: "a", debut: dt("2026-11-11T14:00:00"), fin: dt("2026-11-11T20:00:00") }, ex, 12)).toContain("Repos minimal de 12 h non respecté");
    expect(P.validerGarde({ personnelId: "a", debut: dt("2026-11-12T20:00:00"), fin: dt("2026-11-13T08:00:00") }, ex, 12)).toEqual([]);
    expect(P.validerGarde({ personnelId: "b", debut: dt("2026-11-10T20:00:00"), fin: dt("2026-11-11T08:00:00") }, ex, 12)).toEqual([]);
    expect(P.validerGarde({ personnelId: "b", debut: dt("2026-11-10T20:00:00"), fin: dt("2026-11-11T08:00:00") }, ex, 12, [{ personnelId: "b", debut: d("2026-11-09"), fin: d("2026-11-12") }])).toContain("L'agent est en congé");
  });
  it("répartition de la charge", () => { expect([...P.chargeGardes([...ex, ...ex, { ...ex[0], personnelId: "b" }])]).toEqual([["a", 2], ["b", 1]]); });
});
describe("service", () => {
  const mk = () => { const logs: string[] = []; return { logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } }, d: { creerFiche: async () => ({ id: "p1" }) } }; };
  it("création autorisée pour le responsable administratif, auditée", async () => {
    const { a, d: dep, logs } = mk(); const r = await P.creerFichePersonnel(dep, a, { id: "u", roles: ["RESPONSABLE_ADMIN"] }, "s", { nom: "S", prenom: "A", fonction: "IDE" });
    expect(r).toEqual({ ok: true, id: "p1" }); expect(logs).toEqual(["PERSONNEL_CREE"]);
  });
  it("refusée à l'agent de santé ; approbation de congé réservée aux valideurs", async () => {
    const { a, d: dep } = mk();
    await expect(P.creerFichePersonnel(dep, a, { id: "u", roles: ["AGENT_SANTE"] }, "s", { nom: "S", prenom: "A", fonction: "IDE" })).rejects.toThrow(ErreurAcces);
    await expect(P.approuverConge(a, { id: "u", roles: ["RESPONSABLE_ADMIN"] }, "c")).rejects.toThrow(ErreurAcces);
    await expect(P.approuverConge(a, { id: "u", roles: ["RESPONSABLE_POSTE"] }, "c")).resolves.toBeUndefined();
  });
});
