import { describe, it, expect } from "vitest";
import { creerDepotPrisma, creerAuditPrisma, type LigneUtilisateur, type PrismaLike } from "./depot-prisma.js";
import { creerAdmin } from "./creer-admin.js";
import { lireConfig } from "./config.js";
import { verifier } from "../../../packages/auth/src/password.js";

function faussePrisma() {
  const users: (LigneUtilisateur & { derniereConnexion?: Date })[] = []; const audits: Record<string, unknown>[] = []; const sites: { id: string; code: string }[] = []; const creations: Record<string, unknown>[] = []; let roleManquant = false;
  const p: PrismaLike = {
    utilisateur: {
      findUnique: async ({ where }) => users.find((u) => ("email" in where ? u.email === where.email : u.id === where.id)) ?? null,
      update: async ({ where, data }) => { Object.assign(users.find((u) => u.id === where.id)!, data); },
      create: async ({ data }) => { creations.push(data); if (roleManquant) throw Object.assign(new Error("not found"), { code: "P2025" });
        const id = "id" + (users.length + 1); users.push({ id, siteId: String(data.siteId), email: String(data.email), nomComplet: String(data.nomComplet), motDePasseHash: String(data.motDePasseHash), mfaSecret: (data.mfaSecret as string | null) ?? null, statut: "ACTIF", tentativesEchec: 0, verrouJusqua: null, roles: [{ role: { code: "ADMIN_SYSTEME" } }] }); return { id }; },
    },
    journalAudit: { create: async ({ data }) => { audits.push(data); } },
    site: { findUnique: async ({ where }) => sites.find((s) => s.code === where.code) ?? null, create: async ({ data }) => { const s = { id: "site" + (sites.length + 1), code: String(data.code) }; sites.push(s); return s; } },
  };
  return { p, users, audits, sites, creations, manquerRole: () => { roleManquant = true; } };
}
const entree = { email: "Admin@Poste.sn", motDePasse: "Abc!defg123", nomComplet: "Awa Diop", codeSite: "NDM", avecMfa: false };

describe("adaptateur PostgreSQL (logique, base simulée)", () => {
  it("lecture par e-mail / id avec rôles aplatis, échec, succès", async () => {
    const f = faussePrisma(); await creerAdmin(f.p, entree); const d = creerDepotPrisma(f.p);
    const c = await d.parEmail("admin@poste.sn"); expect(c).toMatchObject({ email: "admin@poste.sn", nomComplet: "Awa Diop", roles: ["ADMIN_SYSTEME"], statut: "ACTIF" }); expect(await d.parId(c!.id)).toMatchObject({ id: c!.id }); expect(await d.parEmail("x@y.sn")).toBeNull();
    const v = new Date(); await d.enregistrerEchec(c!.id, 3, v); expect(f.users[0]).toMatchObject({ tentativesEchec: 3, verrouJusqua: v });
    await d.enregistrerSucces(c!.id); expect(f.users[0]).toMatchObject({ tentativesEchec: 0, verrouJusqua: null }); expect(f.users[0].derniereConnexion).toBeInstanceOf(Date);
  });
  it("audit : site, IP, action ; pas d'identifiant saisi stocké", async () => {
    const f = faussePrisma(); await creerAuditPrisma(f.p, "site1")({ ip: "1.2.3.4" }).log({ action: "LOGIN_ECHEC_INCONNU" });
    expect(f.audits[0]).toMatchObject({ siteId: "site1", action: "LOGIN_ECHEC_INCONNU", entite: "Auth", ip: "1.2.3.4" }); expect(JSON.stringify(f.audits[0])).not.toMatch(/@/);
  });
});
describe("création du premier administrateur", () => {
  it("crée le site, l'admin (e-mail en minuscules, mot de passe haché, rôle ADMIN_SYSTEME)", async () => {
    const f = faussePrisma(); const r = await creerAdmin(f.p, entree); expect(r.mfaSecret).toBeNull(); expect(f.sites).toHaveLength(1);
    const c = f.creations[0]; expect(c.email).toBe("admin@poste.sn"); expect(String(c.motDePasseHash)).toMatch(/^scrypt\$/); expect(await verifier(entree.motDePasse, String(c.motDePasseHash))).toBe(true);
    expect(c.roles).toEqual({ create: [{ role: { connect: { code: "ADMIN_SYSTEME" } } }] });
  });
  it("réutilise le site existant", async () => { const f = faussePrisma(); f.sites.push({ id: "s0", code: "NDM" }); await creerAdmin(f.p, entree); expect(f.sites).toHaveLength(1); expect(f.users[0].siteId).toBe("s0"); });
  it("avec double authentification : secret et lien otpauth", async () => { const r = await creerAdmin(faussePrisma().p, { ...entree, avecMfa: true }); expect(r.mfaSecret).toMatch(/^[A-Z2-7]{32}$/); expect(r.otpauth).toContain("secret=" + r.mfaSecret); });
  it("refuse : mot de passe faible, e-mail invalide, nom vide, doublon, rôle absent (seed oublié)", async () => {
    const f = faussePrisma();
    await expect(creerAdmin(f.p, { ...entree, motDePasse: "faible" })).rejects.toThrow("trop faible"); await expect(creerAdmin(f.p, { ...entree, email: "pas-un-email" })).rejects.toThrow("e-mail invalide"); await expect(creerAdmin(f.p, { ...entree, nomComplet: " " })).rejects.toThrow("Nom complet");
    expect(f.users).toHaveLength(0); await creerAdmin(f.p, entree); await expect(creerAdmin(f.p, entree)).rejects.toThrow("existe déjà");
    const g = faussePrisma(); g.manquerRole(); await expect(creerAdmin(g.p, entree)).rejects.toThrow("npm run db:seed");
  });
});
describe("configuration", () => {
  it("secret obligatoire et assez long", () => { expect(() => lireConfig({})).toThrow("SESSION_SECRET"); expect(() => lireConfig({ SESSION_SECRET: "court" })).toThrow("32 caractères"); });
  it("valeurs par défaut et production", () => {
    const s = "s".repeat(32); expect(lireConfig({ SESSION_SECRET: s })).toEqual({ port: 4000, hote: "0.0.0.0", secret: s, production: false, codeSite: "NDM", trustProxy: false });
    expect(lireConfig({ SESSION_SECRET: s, NODE_ENV: "production", PORT: "8080", TRUST_PROXY: "true", SITE_CODE: "XYZ" })).toMatchObject({ port: 8080, production: true, trustProxy: true, codeSite: "XYZ" });
    expect(() => lireConfig({ SESSION_SECRET: s, PORT: "abc" })).toThrow("PORT invalide");
  });
});
