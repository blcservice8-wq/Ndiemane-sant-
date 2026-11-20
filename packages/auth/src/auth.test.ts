import { describe, it, expect } from "vitest";
import { hacher, verifier, validerComplexite } from "./password.js";
import { genererSecret, code, verifierCode } from "./totp.js";
import { peut, exiger, ErreurAcces, ROLES, MODULES_MEDICAUX, MODULES } from "./rbac.js";
import { emettre, lire } from "./session.js";
import { connecter, type CompteAuth, type DepotAuth } from "./auth-service.js";
import { genererSeed } from "./seed.js";

describe("mots de passe", () => {
  it("hache et vérifie", async () => { const h = await hacher("Abc!defg123"); expect(await verifier("Abc!defg123", h)).toBe(true); expect(await verifier("autre", h)).toBe(false); });
  it("deux hachages du même mot de passe diffèrent", async () => { expect(await hacher("x")).not.toBe(await hacher("x")); });
  it("règles de complexité", () => { expect(validerComplexite("abc")).not.toEqual([]); expect(validerComplexite("Abc!defg123")).toEqual([]); });
});
describe("TOTP", () => {
  it("vecteur RFC 6238 (SHA1, t=59)", () => { expect(code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082"); });
  it("accepte ±1 pas, refuse au-delà", () => {
    const s = genererSecret(), t = 1_700_000_000_000;
    expect(verifierCode(s, code(s, t), t)).toBe(true);
    expect(verifierCode(s, code(s, t), t + 30_000)).toBe(true);
    expect(verifierCode(s, code(s, t), t + 120_000)).toBe(false);
  });
});
describe("RBAC", () => {
  const u = (...roles: string[]) => ({ id: "u", roles });
  it("admin système n'a aucun accès médical", () => {
    for (const m of MODULES_MEDICAUX) for (const a of ["LIRE","CREER","MODIFIER"] as const) expect(peut(u("ADMIN_SYSTEME"), m, a)).toBe(false);
  });
  it("rôles non médicaux sans accès médical", () => {
    for (const r of ["GESTIONNAIRE_FINANCIER","RESPONSABLE_LOGISTIQUE","RESPONSABLE_ADMIN","GESTIONNAIRE_PHARMACIE","CONTROLEUR","LECTEUR"])
      for (const m of MODULES_MEDICAUX) expect(peut(u(r), m, "LIRE")).toBe(false);
  });
  it("VIH réservé à qui est désigné", () => {
    const avec = Object.keys(ROLES).filter((r) => peut(u(r), "programmes_vih", "LIRE"));
    expect(avec).toEqual(["INFIRMIER_CHEF"]);
  });
  it("sage-femme crée un patient mais ne gère pas les finances", () => {
    expect(peut(u("SAGE_FEMME"), "patients", "CREER")).toBe(true);
    expect(peut(u("SAGE_FEMME"), "finances", "LIRE")).toBe(false);
  });
  it("le financier ne valide pas ses propres dépenses", () => { expect(peut(u("GESTIONNAIRE_FINANCIER"), "finances", "VALIDER")).toBe(false); expect(peut(u("RESPONSABLE_POSTE"), "finances", "VALIDER")).toBe(true); });
  it("exiger lève ErreurAcces", () => { expect(() => exiger(u("LECTEUR"), "finances", "LIRE")).toThrow(ErreurAcces); });
  it("cumul de rôles et surcharges configurables", () => {
    expect(peut(u("LECTEUR", "TECHNICIEN_LABO"), "laboratoire", "VALIDER")).toBe(true);
    expect(peut({ id: "u", roles: ["LECTEUR"], surcharges: { finances: ["LIRE"] } }, "finances", "LIRE")).toBe(true);
  });
  it("rôle inconnu = aucun droit", () => { expect(peut(u("INCONNU"), "patients", "LIRE")).toBe(false); });
});
describe("session", () => {
  it("émet, lit, expire, refuse la falsification", () => {
    const j = emettre({ sub: "1", roles: ["LECTEUR"] }, "secret", 60, 0);
    expect(lire(j, "secret", 30_000)?.sub).toBe("1");
    expect(lire(j, "secret", 61_000)).toBeNull();
    expect(lire(j, "autre", 0)).toBeNull();
    expect(lire(j.replace(/^./, "X"), "secret", 0)).toBeNull();
  });
});
describe("connexion", () => {
  const mk = async (extra: Partial<CompteAuth> = {}) => {
    const c: CompteAuth = { id: "1", email: "a@b.sn", motDePasseHash: await hacher("Abc!defg123"), statut: "ACTIF", tentativesEchec: 0, verrouJusqua: null, mfaSecret: null, roles: ["LECTEUR"], ...extra };
    const logs: string[] = [];
    const d: DepotAuth = { parEmail: async (e) => (e === c.email ? c : null),
      enregistrerEchec: async (_i, n, v) => { c.tentativesEchec = n; c.verrouJusqua = v; }, enregistrerSucces: async () => { c.tentativesEchec = 0; } };
    return { c, d, logs, a: { log: async (e: { action: string }) => { logs.push(e.action); } } };
  };
  it("succès", async () => { const { d, a } = await mk(); const r = await connecter(d, a, "s", "A@B.sn", "Abc!defg123"); expect(r.ok).toBe(true); });
  it("mauvais mot de passe puis verrouillage après 5 échecs", async () => {
    const { d, a, c } = await mk(); const t = new Date("2026-01-01T10:00:00Z");
    for (let i = 0; i < 5; i++) expect((await connecter(d, a, "s", "a@b.sn", "mauvais", undefined, t)).ok).toBe(false);
    expect(c.verrouJusqua).not.toBeNull();
    const r = await connecter(d, a, "s", "a@b.sn", "Abc!defg123", undefined, t);
    expect(r).toEqual({ ok: false, raison: "VERROUILLE" });
    const apres = new Date(t.getTime() + 16 * 60_000);
    expect((await connecter(d, a, "s", "a@b.sn", "Abc!defg123", undefined, apres)).ok).toBe(true);
  });
  it("MFA requis puis validé", async () => {
    const s = genererSecret(); const { d, a } = await mk({ mfaSecret: s }); const t = new Date();
    expect(await connecter(d, a, "s", "a@b.sn", "Abc!defg123", undefined, t)).toEqual({ ok: false, raison: "MFA_REQUIS" });
    expect((await connecter(d, a, "s", "a@b.sn", "Abc!defg123", "000000", t)).ok).toBe(false);
    expect((await connecter(d, a, "s", "a@b.sn", "Abc!defg123", code(s, t.getTime()), t)).ok).toBe(true);
  });
  it("compte suspendu et utilisateur inconnu refusés, audités", async () => {
    const { d, a, logs } = await mk({ statut: "SUSPENDU" });
    expect(await connecter(d, a, "s", "a@b.sn", "Abc!defg123")).toEqual({ ok: false, raison: "COMPTE_INACTIF" });
    expect((await connecter(d, a, "s", "x@y.sn", "z")).ok).toBe(false);
    expect(logs).toContain("LOGIN_COMPTE_INACTIF"); expect(logs).toContain("LOGIN_ECHEC_INCONNU");
  });
});
describe("seed", () => {
  it("12 rôles, permissions = modules × actions", () => {
    const s = genererSeed(); expect(s.roles).toHaveLength(12); expect(s.permissions).toHaveLength(MODULES.length * 6);
  });
});
