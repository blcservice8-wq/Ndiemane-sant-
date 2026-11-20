import { describe, it, expect } from "vitest";
import * as P from "./patients.js";
import { validerConstantes, imc, signaux, validerConsultation } from "./consultation.js";
import { datePrevueAccouchement, ageGestationnel, validerDDR, prochaineVisiteCPN } from "./maternite.js";
import { dosesManquantes, prochaineDose } from "./vaccination.js";
import { ErreurAcces } from "../../auth/src/rbac.js";

const site = { id: "s1", code: "NDM" };
const nouveau = (o: Partial<P.NouveauPatient> = {}): P.NouveauPatient => ({ nom: "Diouf", prenom: "Awa", sexe: "F", dateNaissance: new Date("1990-05-10"), localite: "Ndiemane", ...o });
const mkDepot = (existants: P.PatientExistant[] = []) => { const cr: unknown[] = [];
  const d: P.DepotPatients = { tous: async () => existants, prochainSequence: async () => existants.length + 1, creer: async (p) => { cr.push(p); return { id: "id" + cr.length }; } };
  const logs: string[] = []; return { d, cr, logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } } }; };
const u = (r: string) => ({ id: "u1", roles: [r] });

describe("patients", () => {
  it("normalise accents et casse", () => { expect(P.normaliser("  Éloïse  N'DIAYE ")).toBe("eloise n diaye"); });
  it("empreinte stable", () => { expect(P.empreinteDoublon(nouveau())).toBe(P.empreinteDoublon(nouveau({ nom: "DIOUF", prenom: "awa" }))); });
  it("distance de Levenshtein", () => { expect(P.distance("kitten", "sitting")).toBe(3); expect(P.distance("", "abc")).toBe(3); });
  it("détecte un doublon proche (faute de frappe, même naissance)", () => {
    const ex = [{ ...nouveau({ nom: "Diouff" }), id: "1", numeroDossier: "NDM-2026-000001" }];
    expect(P.candidatsDoublon(nouveau(), ex)).toHaveLength(1);
  });
  it("ne signale pas deux personnes différentes ni un autre sexe", () => {
    expect(P.candidatsDoublon(nouveau(), [{ ...nouveau({ nom: "Sow", prenom: "Moussa", sexe: "M" }), id: "2", numeroDossier: "x" }])).toHaveLength(0);
    expect(P.candidatsDoublon(nouveau(), [{ ...nouveau({ sexe: "M" }), id: "3", numeroDossier: "y" }])).toHaveLength(0);
  });
  it("numéro de dossier", () => { expect(P.formaterNumero("NDM", 2026, 42)).toBe("NDM-2026-000042"); });
  it("validation", () => {
    expect(P.validerPatient(nouveau({ nom: " " }))).toContain("Nom obligatoire");
    expect(P.validerPatient(nouveau({ telephone: "abc" }))).toContain("Téléphone invalide");
    expect(P.validerPatient(nouveau({ dateNaissance: new Date("2999-01-01") }))).toContain("Date de naissance invalide");
    expect(P.validerPatient(nouveau({ telephone: "+221 77 123 45 67" }))).toEqual([]);
  });
  it("âge en mois et années", () => { expect(P.age(new Date("2025-08-20"), new Date("2026-11-19"))).toEqual({ ans: 1, mois: 2, totalMois: 14 }); });
  it("création + audit + numéro", async () => {
    const { d, a, logs } = mkDepot(); const r = await P.creerPatient(d, a, u("AGENT_SANTE"), site, nouveau(), { maintenant: new Date("2026-03-01") });
    expect(r).toMatchObject({ statut: "CREE", numeroDossier: "NDM-2026-000001" }); expect(logs).toEqual(["PATIENT_CREE"]);
  });
  it("doublon possible bloque sauf confirmation explicite", async () => {
    const ex = [{ ...nouveau(), id: "1", numeroDossier: "NDM-2026-000001" }]; const { d, a, cr } = mkDepot(ex);
    expect((await P.creerPatient(d, a, u("AGENT_SANTE"), site, nouveau())).statut).toBe("DOUBLON_POSSIBLE"); expect(cr).toHaveLength(0);
    expect((await P.creerPatient(d, a, u("AGENT_SANTE"), site, nouveau(), { confirmerNonDoublon: true })).statut).toBe("CREE");
  });
  it("rôle sans droit refusé, rien n'est écrit", async () => {
    const { d, a, cr } = mkDepot(); await expect(P.creerPatient(d, a, u("GESTIONNAIRE_FINANCIER"), site, nouveau())).rejects.toThrow(ErreurAcces); expect(cr).toHaveLength(0);
  });
  it("données invalides renvoyées sans écriture", async () => {
    const { d, a, cr } = mkDepot(); const r = await P.creerPatient(d, a, u("AGENT_SANTE"), site, nouveau({ prenom: "" })); expect(r.statut).toBe("INVALIDE"); expect(cr).toHaveLength(0);
  });
});
describe("consultation", () => {
  it("plages de constantes", () => { expect(validerConstantes({ temperature: 50 })).toHaveLength(1); expect(validerConstantes({ tensionSys: 120, tensionDia: 130 })).toHaveLength(1); expect(validerConstantes({ poids: 70, tensionSys: 120, tensionDia: 80 })).toEqual([]); });
  it("IMC et signaux", () => { expect(imc(70, 175)).toBe(22.9); expect(imc()).toBeNull(); expect(signaux({ temperature: 38.5, tensionSys: 150 })).toEqual(["Fièvre", "Tension systolique élevée"]); });
  it("diagnostic principal unique et CIM-10", () => {
    expect(validerConsultation({ motif: "Toux", constantes: {}, diagnostics: [{ libelle: "a" }, { libelle: "b" }] })).toContain("Un seul diagnostic principal requis");
    expect(validerConsultation({ motif: "Toux", constantes: {}, diagnostics: [{ libelle: "Paludisme", codeCim10: "B54", principal: true }] })).toEqual([]);
    expect(validerConsultation({ motif: "x", constantes: {}, diagnostics: [{ libelle: "?", codeCim10: "ZZ", principal: true }] })[0]).toContain("CIM-10");
    expect(validerConsultation({ motif: "", constantes: {}, diagnostics: [] })).toContain("Motif obligatoire");
  });
});
describe("maternité", () => {
  const ddr = new Date("2026-01-01T00:00:00Z");
  it("DPA = DDR + 280 j", () => { expect(datePrevueAccouchement(ddr).toISOString().slice(0, 10)).toBe("2026-10-08"); });
  it("âge gestationnel", () => { expect(ageGestationnel(ddr, new Date("2026-03-12T00:00:00Z"))).toMatchObject({ semaines: 10, jours: 0 }); });
  it("DDR invalide", () => { expect(validerDDR(ddr, new Date("2025-12-01"))).toEqual(["DDR dans le futur"]); expect(validerDDR(ddr, new Date("2026-12-31"))).toHaveLength(1); });
  it("prochaine CPN selon calendrier paramétré", () => {
    const cal = [12, 20, 28, 36];
    expect(prochaineVisiteCPN(ddr, 1, cal)?.toISOString().slice(0, 10)).toBe("2026-05-21"); expect(prochaineVisiteCPN(ddr, 4, cal)).toBeNull();
  });
});
describe("vaccination (calendrier de TEST, non officiel)", () => {
  const cal = [{ vaccin: "V1", dose: 1, agePremierMois: 0 }, { vaccin: "V2", dose: 1, agePremierMois: 2 }, { vaccin: "V2", dose: 2, agePremierMois: 4 }];
  it("doses manquantes et prochaine dose", () => {
    expect(dosesManquantes(3, cal, [{ vaccin: "V1", dose: 1 }]).map((e) => `${e.vaccin}${e.dose}`)).toEqual(["V21"]);
    expect(prochaineDose(3, cal, [])?.dose).toBe(2); expect(prochaineDose(6, cal, [])).toBeNull();
  });
});
