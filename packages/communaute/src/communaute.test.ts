import { describe, it, expect } from "vitest";
import * as C from "./communaute.js";
import { peut, MODULES_MEDICAUX, ErreurAcces } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T00:00:00Z"); const now = d("2026-11-19");

describe("associations et membres", () => {
  it("validation et doublon par localité", () => {
    expect(C.validerAssociation({ nom: "", type: "X" })).toHaveLength(2);
    expect(C.validerAssociation({ nom: "Bajenu Gox Ndiemane", type: "BAJENU_GOX", localite: "Ndiémane" }, [{ nom: "bajenu-gox ndiemane", localite: "Ndiemane" }])).toContain("Association déjà enregistrée dans cette localité");
    expect(C.validerAssociation({ nom: "Femmes de Ndiemane", type: "FEMMES", localite: "Ndiemane" }, [{ nom: "Femmes de Ndiemane", localite: "Autre" }])).toEqual([]);
  });
  it("membre : téléphone et doublon", () => { expect(C.validerMembre({ nom: "A", telephone: "12" })).toContain("Téléphone invalide"); expect(C.validerMembre({ nom: "Awa Diop" }, [{ nom: "awa  diop" }])).toContain("Membre déjà enregistré"); });
  it("bureau : une seule personne par fonction unique, inactifs ignorés", () => {
    expect(C.validerBureau([{ nom: "a", fonction: "Président" }, { nom: "b", fonction: "president" }])).toHaveLength(1);
    expect(C.validerBureau([{ nom: "a", fonction: "Président" }, { nom: "b", fonction: "Président", actif: false }, { nom: "c", fonction: "Trésorière" }])).toEqual([]);
    expect(C.effectifActif([{ nom: "a" }, { nom: "b", actif: false }])).toBe(1);
  });
});
describe("réunions et PV", () => {
  const r = { associationId: "a", date: d("2026-11-10"), ordreDuJour: ["Hygiène"], presents: 12, effectif: 20 };
  const pv = { decisions: ["Nettoyage mensuel"], redacteur: "Secrétaire", contenu: "…" };
  it("quorum paramétrable", () => { expect(C.quorumAtteint(r, 50)).toBe(true); expect(C.quorumAtteint(r, 75)).toBe(false); expect(C.quorumAtteint({ presents: 0, effectif: 0 }, 1)).toBe(false); });
  it("PV valide", () => { expect(C.validerPV(pv, r, 50, now)).toEqual([]); });
  it("PV invalide : quorum, ordre du jour, futur, incohérence", () => {
    expect(C.validerPV(pv, r, 75, now)[0]).toContain("Quorum non atteint");
    expect(C.validerPV({ ...pv, contenu: "" }, { ...r, ordreDuJour: [], date: d("2027-01-01"), presents: 30 }, 50, now).length).toBeGreaterThanOrEqual(4);
  });
  it("un PV adopté est immuable", () => {
    const b: C.PV = { reunionId: "r", statut: "BROUILLON", decisions: [], redacteur: "s", contenu: "a" };
    const a = C.adopterPV(C.modifierPV(b, { contenu: "b" })); expect(a.statut).toBe("ADOPTE");
    expect(() => C.modifierPV(a, { contenu: "c" })).toThrow("interdite"); expect(() => C.adopterPV(a)).toThrow("Déjà adopté");
  });
});
describe("activités", () => {
  it("validation", () => {
    expect(C.validerActivite({ associationId: "a", type: "SENSIBILISATION", date: now, participants: 10 }, now)).toContain("Thème obligatoire pour une sensibilisation");
    expect(C.validerActivite({ associationId: "a", type: "REUNION", date: d("2027-01-01"), participants: -1 }, now)).toHaveLength(2);
    expect(C.validerActivite({ associationId: "a", type: "MOBILISATION", date: d("2026-11-01"), participants: 30 }, now)).toEqual([]);
  });
  const acts: C.Activite[] = [{ associationId: "a", type: "SENSIBILISATION", date: d("2026-11-05"), participants: 40, theme: "Paludisme" }, { associationId: "a", type: "REUNION", date: d("2026-10-01"), participants: 15 }, { associationId: "b", type: "MOBILISATION", date: d("2026-05-01") }];
  it("bilan par type sur une période", () => { expect(C.bilanActivites(acts, d("2026-10-01"), d("2026-11-30"))).toEqual({ total: 2, participants: 55, parType: { SENSIBILISATION: { nombre: 1, participants: 40 }, REUNION: { nombre: 1, participants: 15 } } }); });
  it("associations inactives", () => { expect(C.associationsInactives(["a", "b", "c"], acts, now)).toEqual(["b", "c"]); });
});
describe("contributions", () => { it("total et validation", () => {
  const c = [{ associationId: "a", montantFcfa: 5000, date: now }, { associationId: "b", montantFcfa: 2000, date: now }];
  expect(C.totalContributions(c)).toBe(7000); expect(C.totalContributions(c, "a")).toBe(5000); expect(C.validerContribution({ associationId: "a", montantFcfa: -5, date: now })).toHaveLength(1); expect(C.validerContribution(c[0])).toEqual([]);
}); });
describe("confidentialité", () => {
  it("le rapport communautaire ne contient que des agrégats", () => { expect(Object.keys(C.rapportCommunautaire(C.bilanActivites([], now, now), { a: 10 }, 0))).toEqual(["activites", "effectifsParAssociation", "contributionsFcfa"]); });
  it("aucun rôle communautaire/administratif n'a accès aux modules médicaux", () => {
    for (const r of ["RESPONSABLE_ADMIN", "GESTIONNAIRE_FINANCIER", "RESPONSABLE_LOGISTIQUE", "LECTEUR"]) for (const m of MODULES_MEDICAUX) expect(peut({ id: "u", roles: [r] }, m, "LIRE")).toBe(false);
  });
});
describe("service", () => {
  const mk = () => { const logs: string[] = []; return { logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } }, d: { existantes: async () => [], creer: async () => ({ id: "as1" }) } }; };
  it("création par le responsable administratif, auditée", async () => { const m = mk(); expect(await C.enregistrerAssociation(m.d, m.a, { id: "u", roles: ["RESPONSABLE_ADMIN"] }, "s", { nom: "CDS Ndiemane", type: "CDS" })).toEqual({ ok: true, id: "as1" }); expect(m.logs).toEqual(["ASSOCIATION_CREEE"]); });
  it("refusée à l'agent de santé", async () => { const m = mk(); await expect(C.enregistrerAssociation(m.d, m.a, { id: "u", roles: ["AGENT_SANTE"] }, "s", { nom: "x", type: "CDS" })).rejects.toThrow(ErreurAcces); });
});
