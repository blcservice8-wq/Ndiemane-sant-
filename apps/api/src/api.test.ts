import { describe, it, expect, beforeAll } from "vitest";
import { construireApp, NOM_COOKIE, type DepotApi, type Deps } from "./app.js";
import { hacher } from "../../../packages/auth/src/password.js";
import { genererSecret, code } from "../../../packages/auth/src/totp.js";
import { LimiteurDebit } from "../../../packages/securite/src/protection.js";
import type { CompteAuth } from "../../../packages/auth/src/auth-service.js";
import { PAGE_CONNEXION, JS_CONNEXION } from "./pages.js";

const MDP = "Abc!defg123", SECRET = "x".repeat(40);
let hashMdp = "";
beforeAll(async () => { hashMdp = await hacher(MDP); });

function monde(opts: { mfaSecret?: string; limiteur?: LimiteurDebit; production?: boolean } = {}) {
  const t0 = new Date("2026-11-20T10:00:00Z"); let horloge = t0;
  const users = new Map<string, CompteAuth>();
  const base: CompteAuth = { id: "u1", email: "awa@poste.sn", nomComplet: "Awa Diop", motDePasseHash: hashMdp, statut: "ACTIF", tentativesEchec: 0, verrouJusqua: null, mfaSecret: opts.mfaSecret ?? null, roles: ["INFIRMIER_CHEF"] };
  users.set("awa@poste.sn", base);
  const logs: { action: string; ip: string; utilisateurId?: string }[] = []; let panne = false;
  const depot: DepotApi = {
    parEmail: async (e) => { if (panne) throw new Error("boom-secret-interne"); return users.get(e) ?? null; },
    parId: async (id) => [...users.values()].find((u) => u.id === id) ?? null,
    enregistrerEchec: async (id, n, v) => { const u = [...users.values()].find((x) => x.id === id)!; u.tentativesEchec = n; u.verrouJusqua = v; },
    enregistrerSucces: async (id) => { const u = [...users.values()].find((x) => x.id === id)!; u.tentativesEchec = 0; u.verrouJusqua = null; },
  };
  const deps: Deps = { depot, secret: SECRET, production: opts.production ?? false, limiteur: opts.limiteur, maintenant: () => horloge,
    creerAudit: ({ ip }) => ({ log: async (e) => { logs.push({ action: e.action, ip, utilisateurId: e.utilisateurId }); } }) };
  return { deps, users, logs, base, avancer: (ms: number) => { horloge = new Date(horloge.getTime() + ms); }, maintenant: () => horloge, casser: () => { panne = true; } };
}
const login = (app: Awaited<ReturnType<typeof construireApp>>, payload: unknown) => app.inject({ method: "POST", url: "/api/auth/login", payload: payload as object });
const ok = { email: "awa@poste.sn", motDePasse: MDP };

describe("connexion", () => {
  it("succès : cookie HttpOnly + SameSite=Strict, aucune donnée sensible renvoyée", async () => {
    const m = monde(); const app = await construireApp(m.deps); const r = await login(app, ok);
    expect(r.statusCode).toBe(200); expect(r.json().utilisateur).toEqual({ id: "u1", email: "awa@poste.sn", nomComplet: "Awa Diop", roles: ["INFIRMIER_CHEF"] });
    const c = r.cookies.find((x) => x.name === NOM_COOKIE)!; expect(c).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" }); expect(c.secure).toBeFalsy();
    expect(r.body).not.toMatch(/scrypt|motDePasseHash|mfaSecret|Abc!/); expect(r.body).not.toContain(c.value);
    expect(m.logs.map((l) => l.action)).toContain("LOGIN_SUCCES");
  });
  it("en production le cookie est Secure", async () => { const app = await construireApp(monde({ production: true }).deps); expect((await login(app, ok)).cookies[0].secure).toBe(true); });
  it("e-mail non sensible à la casse et aux espaces ? : la casse est normalisée", async () => { const app = await construireApp(monde().deps); expect((await login(app, { ...ok, email: "AWA@Poste.SN" })).statusCode).toBe(200); });
  it("identifiant inconnu et mauvais mot de passe : réponses strictement identiques (pas d'énumération)", async () => {
    const app = await construireApp(monde().deps); const a = await login(app, { email: "inconnu@poste.sn", motDePasse: MDP }); const b = await login(app, { ...ok, motDePasse: "Mauvais!123456" });
    expect(a.statusCode).toBe(401); expect(b.statusCode).toBe(401); expect(a.body).toBe(b.body); expect(a.json().code).toBe("IDENTIFIANTS");
  });
  it("compte suspendu : même réponse générique, même avec le bon mot de passe", async () => {
    const m = monde(); m.base.statut = "SUSPENDU"; const app = await construireApp(m.deps); const r = await login(app, ok);
    expect(r.statusCode).toBe(401); expect(r.json().code).toBe("IDENTIFIANTS"); expect(r.cookies).toHaveLength(0);
  });
  it("verrouillage après 5 échecs : 423, même avec le bon mot de passe", async () => {
    const m = monde(); const app = await construireApp(m.deps);
    for (let i = 0; i < 5; i++) expect((await login(app, { ...ok, motDePasse: "Mauvais!123456" })).statusCode).toBe(401);
    const r = await login(app, ok); expect(r.statusCode).toBe(423); expect(r.cookies).toHaveLength(0);
    m.avancer(16 * 60_000); expect((await login(app, ok)).statusCode).toBe(200);
  });
  it("double authentification : code requis, mauvais code refusé, bon code accepté", async () => {
    const s = genererSecret(); const m = monde({ mfaSecret: s }); const app = await construireApp(m.deps);
    const sans = await login(app, ok); expect(sans.statusCode).toBe(401); expect(sans.json().code).toBe("MFA_REQUIS"); expect(sans.cookies).toHaveLength(0);
    expect((await login(app, { ...ok, codeMfa: "000000" })).json().code).toBe("IDENTIFIANTS");
    expect((await login(app, { ...ok, codeMfa: code(s, m.maintenant().getTime()) })).statusCode).toBe(200);
  });
  it("limitation de débit par IP : 429 + Retry-After, même avec les bons identifiants", async () => {
    const app = await construireApp(monde({ limiteur: new LimiteurDebit(3, 60_000) }).deps);
    for (let i = 0; i < 3; i++) await login(app, { ...ok, motDePasse: "Mauvais!123456" });
    const r = await login(app, ok); expect(r.statusCode).toBe(429); expect(Number(r.headers["retry-after"])).toBeGreaterThan(0); expect(r.cookies).toHaveLength(0);
  });
  it("l'adresse IP est transmise à l'audit", async () => { const m = monde(); const app = await construireApp(m.deps); await app.inject({ method: "POST", url: "/api/auth/login", payload: ok, remoteAddress: "41.82.10.5" }); expect(m.logs.at(-1)?.ip).toBe("41.82.10.5"); });
});
describe("validation des requêtes", () => {
  it("corps invalide, champ en trop, code MFA mal formé : 400 sans détail technique", async () => {
    const app = await construireApp(monde().deps);
    for (const p of [{}, { email: "a@b.sn" }, { ...ok, admin: true }, { ...ok, codeMfa: "12ab56" }, { email: 5, motDePasse: MDP }, { email: "a@b.sn", motDePasse: "x".repeat(500) }]) {
      const r = await login(app, p); expect(r.statusCode).toBe(400); expect(r.json()).toEqual({ code: "REQUETE_INVALIDE", message: "Requête invalide." });
    }
  });
  it("types non convertis : un nombre n'est jamais pris pour un texte", async () => {
    const app = await construireApp(monde().deps); expect((await login(app, { email: 123456, motDePasse: 123456789 })).statusCode).toBe(400);
  });
  it("anti-CSRF : un formulaire d'un autre site ne peut envoyer que du non-JSON, refusé dans tous les cas ; corps trop gros : 413", async () => {
    const app = await construireApp(monde().deps); const env = (type: string, payload: string) => app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": type }, payload });
    expect((await env("application/x-www-form-urlencoded", "email=awa@poste.sn&motDePasse=Abc!defg123")).statusCode).toBe(415);
    expect((await env("text/plain", JSON.stringify(ok))).statusCode).toBe(400);
    expect((await env("multipart/form-data; boundary=x", "--x--")).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { ...ok, x: "y".repeat(20_000) } })).statusCode).toBe(413);
  });
  it("erreur interne : message générique, aucun détail technique divulgué", async () => {
    const m = monde(); m.casser(); const app = await construireApp(m.deps); const r = await login(app, ok);
    expect(r.statusCode).toBe(500); expect(r.json()).toEqual({ code: "ERREUR_INTERNE", message: "Erreur interne." }); expect(r.body).not.toMatch(/boom|secret|stack|at /i);
  });
});
describe("session", () => {
  const cookieDe = (r: { cookies: { name: string; value: string }[] }) => r.cookies.find((c) => c.name === NOM_COOKIE)!.value;
  it("/api/me : refusé sans cookie, accepté avec ; renvoie les droits du rôle", async () => {
    const app = await construireApp(monde().deps); expect((await app.inject({ url: "/api/me" })).statusCode).toBe(401);
    const v = cookieDe(await login(app, ok)); const r = await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: v } });
    expect(r.statusCode).toBe(200); const d = r.json().droits; expect(d.patients).toContain("CREER"); expect(d.finances).toBeUndefined(); expect(d.programmes_vih).toEqual(["LIRE", "CREER", "MODIFIER"]);
  });
  it("cookie falsifié ou signé avec une autre clé : refusé", async () => {
    const app = await construireApp(monde().deps); const v = cookieDe(await login(app, ok));
    for (const f of [v.slice(0, -2) + "xx", "x." + v.split(".")[1], "n'importe quoi", ""]) expect((await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: f } })).statusCode).toBe(401);
  });
  it("session expirée après 8 h", async () => {
    const m = monde(); const app = await construireApp(m.deps); const v = cookieDe(await login(app, ok));
    m.avancer(7 * 3600_000); expect((await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: v } })).statusCode).toBe(200);
    m.avancer(2 * 3600_000); expect((await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: v } })).statusCode).toBe(401);
  });
  it("compte suspendu APRÈS connexion : accès coupé immédiatement", async () => {
    const m = monde(); const app = await construireApp(m.deps); const v = cookieDe(await login(app, ok));
    m.base.statut = "SUSPENDU"; expect((await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: v } })).statusCode).toBe(401);
  });
  it("retrait de rôle appliqué immédiatement (rôles relus en base)", async () => {
    const m = monde(); const app = await construireApp(m.deps); const v = cookieDe(await login(app, ok));
    m.base.roles = ["LECTEUR"]; const d = (await app.inject({ url: "/api/me", cookies: { [NOM_COOKIE]: v } })).json().droits; expect(d.patients).toBeUndefined(); expect(Object.keys(d).sort()).toEqual(["rapports", "tableau_bord"]);
  });
  it("déconnexion : cookie effacé, action auditée", async () => {
    const m = monde(); const app = await construireApp(m.deps); const v = cookieDe(await login(app, ok));
    const r = await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { [NOM_COOKIE]: v } });
    expect(r.statusCode).toBe(204); expect(r.cookies.find((c) => c.name === NOM_COOKIE)?.value).toBe(""); expect(m.logs.map((l) => l.action)).toContain("LOGOUT");
  });
});
describe("en-têtes et pages", () => {
  it("en-têtes de sécurité sur toutes les réponses, y compris les erreurs", async () => {
    const app = await construireApp(monde().deps);
    for (const r of [await app.inject({ url: "/api/sante" }), await app.inject({ url: "/api/me" }), await login(app, {})]) {
      expect(r.headers["strict-transport-security"]).toContain("max-age"); expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(r.headers["x-content-type-options"]).toBe("nosniff"); expect(r.headers["cache-control"]).toBe("no-store"); expect(r.headers["x-frame-options"]).toBe("DENY");
    }
  });
  it("page de connexion servie ; / redirige ; aucun script en ligne ni innerHTML (CSP stricte, pas de XSS)", async () => {
    const app = await construireApp(monde().deps);
    const p = await app.inject({ url: "/connexion" }); expect(p.statusCode).toBe(200); expect(p.headers["content-type"]).toContain("text/html"); expect(p.body).toBe(PAGE_CONNEXION);
    expect(PAGE_CONNEXION).not.toMatch(/<script(?![^>]*\bsrc=)/); expect(PAGE_CONNEXION).not.toMatch(/\son\w+=/i); expect(JS_CONNEXION).not.toMatch(/innerHTML|eval\(|document\.write/);
    const j = await app.inject({ url: "/connexion.js" }); expect(j.headers["content-type"]).toContain("javascript"); const rd = await app.inject({ url: "/" }); expect([301, 302]).toContain(rd.statusCode); expect(rd.headers.location).toBe("/connexion");
  });
  it("le JavaScript de la page est syntaxiquement valide", () => { expect(() => new Function(JS_CONNEXION)).not.toThrow(); });
  it("santé", async () => { expect((await (await construireApp(monde().deps)).inject({ url: "/api/sante" })).json()).toEqual({ ok: true, service: "ndiemane-api" }); });
});
