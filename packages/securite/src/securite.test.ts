import { describe, it, expect } from "vitest";
import { ChaineAudit, verifierChaine, GENESE } from "./audit-chaine.js"; import { creerSauvegarde, restaurer, testerRestauration, aSupprimer } from "./sauvegarde.js";
import { LimiteurDebit, enTetesSecurite, echapperHtml, neutraliserCellule, versCsvSecurise } from "./protection.js"; import { ROLES, MODULES_MEDICAUX, peut } from "../../auth/src/rbac.js";
const d = (s: string) => new Date(s + "T10:00:00Z");

describe("journal d'audit chaîné", () => {
  const chaine = () => { const c = new ChaineAudit(); c.ajouter({ utilisateurId: "u1", action: "LOGIN" }); c.ajouter({ utilisateurId: "u1", action: "PATIENT_CREE", entite: "Patient", entiteId: "p1", details: { b: 2, a: 1 } }); c.ajouter({ utilisateurId: "u2", action: "DEPENSE_PAYEE", details: { montantFcfa: 50000 } }); return c; };
  it("intact", () => { const c = chaine(); expect(verifierChaine(c.entrees, c.ancre())).toEqual({ ok: true }); expect(verifierChaine([])).toEqual({ ok: true }); expect(c.entrees[0].hashPrec).toBe(GENESE); });
  it("détecte la modification d'un contenu", () => { const c = chaine(); const copie = structuredClone(c.entrees); (copie[2].details as { montantFcfa: number }).montantFcfa = 500; expect(verifierChaine(copie)).toMatchObject({ ok: false, seq: 3, raison: "Contenu modifié" }); });
  it("détecte la modification d'un auteur ou d'une action", () => { const c = chaine(); const copie = structuredClone(c.entrees); copie[0].utilisateurId = "u9"; expect(verifierChaine(copie)).toMatchObject({ ok: false, seq: 1 }); });
  it("détecte une suppression au milieu, un réordonnancement", () => {
    const c = chaine(); expect(verifierChaine([c.entrees[0], c.entrees[2]])).toMatchObject({ ok: false }); expect(verifierChaine([c.entrees[1], c.entrees[0], c.entrees[2]])).toMatchObject({ ok: false });
  });
  it("détecte la troncature des dernières entrées grâce à l'ancre externe", () => { const c = chaine(); const ancre = c.ancre(); expect(verifierChaine(c.entrees.slice(0, 2))).toEqual({ ok: true }); expect(verifierChaine(c.entrees.slice(0, 2), ancre)).toMatchObject({ ok: false, raison: expect.stringContaining("supprimées") }); });
  it("l'ordre des clés des détails n'influe pas sur le hachage", () => { const a = new ChaineAudit(), b = new ChaineAudit(); const t = d("2026-01-01"); a.ajouter({ action: "X", details: { a: 1, b: 2 } }, t); b.ajouter({ action: "X", details: { b: 2, a: 1 } }, t); expect(a.ancre()).toBe(b.ancre()); });
});
describe("sauvegarde et restauration", () => {
  const donnees = { patients: [{ id: "1", nom: "Awa Diouf" }, { id: "2", nom: "Moussa Sow" }], depenses: [{ id: "d1", montant: 5000 }], vide: [] };
  const secret = "cle-de-sauvegarde-forte-2026";
  it("aller-retour identique, manifeste sans donnée personnelle, contenu chiffré", () => {
    const s = creerSauvegarde(donnees, secret, "NDM", d("2026-11-19")); expect(s.manifeste.tables).toEqual({ patients: 2, depenses: 1, vide: 0 });
    expect(JSON.stringify(s)).not.toMatch(/Diouf|Sow/); expect(restaurer(s, secret)).toEqual(donnees); expect(testerRestauration(s, secret, donnees)).toEqual({ ok: true, erreur: null });
  });
  it("mauvaise clé, falsification du contenu, manifeste trafiqué : refus explicite", () => {
    const s = creerSauvegarde(donnees, secret, "NDM"); expect(() => restaurer(s, "mauvaise-cle-12345")).toThrow("mauvaise clé ou sauvegarde altérée");
    const p = s.contenuChiffre.split("."); p[4] = Buffer.from(Buffer.from(p[4], "base64").map((x, i) => (i === 10 ? x ^ 1 : x))).toString("base64"); expect(testerRestauration({ ...s, contenuChiffre: p.join(".") }, secret, donnees).ok).toBe(false);
    expect(() => restaurer({ ...s, manifeste: { ...s.manifeste, sha256: "0".repeat(64) } }, secret)).toThrow("corrompue"); expect(() => restaurer({ ...s, manifeste: { ...s.manifeste, tables: { patients: 99 } } }, secret)).toThrow("incohérente");
  });
  it("clé trop courte refusée ; chaque sauvegarde est chiffrée différemment", () => { expect(() => creerSauvegarde(donnees, "court", "NDM")).toThrow("trop courte"); expect(creerSauvegarde(donnees, secret, "N").contenuChiffre).not.toBe(creerSauvegarde(donnees, secret, "N").contenuChiffre); });
  it("rétention : 7 quotidiennes + 4 hebdomadaires + 12 mensuelles", () => {
    const dates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 10, 19) - i * 86_400_000 + 3_600_000)); const sup = aSupprimer(dates, { quotidiennes: 7, hebdomadaires: 4, mensuelles: 12 });
    const gardees = dates.filter((x) => !sup.includes(x)); expect(gardees.length).toBeGreaterThanOrEqual(12); expect(gardees.length).toBeLessThanOrEqual(23);
    for (let i = 0; i < 7; i++) expect(gardees).toContain(dates[i]); expect(sup).toContain(dates[399]); expect(gardees).toContain(dates[0]);
  });
  it("rétention : jamais plus d'une sauvegarde supprimée si une seule existe, et aucune suppression d'une liste vide", () => { expect(aSupprimer([], { quotidiennes: 7, hebdomadaires: 4, mensuelles: 12 })).toEqual([]); expect(aSupprimer([d("2026-11-19")], { quotidiennes: 7, hebdomadaires: 4, mensuelles: 12 })).toEqual([]); });
});
describe("protections", () => {
  it("limiteur : bloque après N tentatives, libère après la fenêtre, clés indépendantes", () => {
    const l = new LimiteurDebit(3, 60_000); const t = 1_000_000; for (let i = 0; i < 3; i++) expect(l.autoriser("ip1", t + i).ok).toBe(true);
    expect(l.autoriser("ip1", t + 10)).toMatchObject({ ok: false, reessayerApresMs: 59_990 }); expect(l.autoriser("ip2", t).ok).toBe(true); expect(l.autoriser("ip1", t + 60_001).ok).toBe(true);
  });
  it("en-têtes HTTP de sécurité", () => { const h = enTetesSecurite(); expect(h["Strict-Transport-Security"]).toContain("max-age=63072000"); expect(h["Content-Security-Policy"]).toContain("default-src 'self'"); expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'"); expect(h["X-Content-Type-Options"]).toBe("nosniff"); expect(h["Cache-Control"]).toBe("no-store"); });
  it("échappement HTML", () => { expect(echapperHtml(`<img src=x onerror="alert('x')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"); });
  it("injection de formule CSV neutralisée, nombres négatifs intacts, guillemets et séparateurs échappés", () => {
    expect(neutraliserCellule("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")"); expect(neutraliserCellule("+1+1")).toBe("'+1+1"); expect(neutraliserCellule("@SUM(A1)")).toBe("'@SUM(A1)"); expect(neutraliserCellule(-5)).toBe("-5"); expect(neutraliserCellule(null)).toBe("");
    expect(versCsvSecurise([["Nom", "Note"], ["=cmd|' /C calc'!A0", 'dit "bonjour"; ok']])).toBe('Nom;Note\r\n\'=cmd|\' /C calc\'!A0;"dit ""bonjour""; ok"');
  });
});
describe("garde-fou RBAC : qui lit les données médicales (régression)", () => {
  const lecteurs = (m: Parameters<typeof peut>[1]) => Object.keys(ROLES).filter((r) => peut({ id: "u", roles: [r] }, m, "LIRE")).sort();
  it("liste exacte des rôles ayant accès à chaque module médical", () => {
    const sante = ["AGENT_SANTE", "INFIRMIER_CHEF", "RESPONSABLE_POSTE", "SAGE_FEMME"];
    expect(lecteurs("patients")).toEqual(sante); expect(lecteurs("consultations")).toEqual(sante); expect(lecteurs("maternite_vaccination")).toEqual(sante);
    expect(lecteurs("laboratoire")).toEqual([...sante, "TECHNICIEN_LABO"].sort()); expect(lecteurs("programmes_vih")).toEqual(["INFIRMIER_CHEF"]);
  });
  it("l'administrateur système, le financier, le logisticien, le contrôleur, le lecteur n'ont aucun droit sur les modules médicaux", () => {
    for (const r of ["ADMIN_SYSTEME", "GESTIONNAIRE_FINANCIER", "RESPONSABLE_LOGISTIQUE", "CONTROLEUR", "LECTEUR", "RESPONSABLE_ADMIN"]) for (const m of MODULES_MEDICAUX) for (const a of ["LIRE", "CREER", "MODIFIER", "EXPORTER"] as const) expect(peut({ id: "u", roles: [r] }, m, a)).toBe(false);
  });
  it("aucun rôle ne peut ARCHIVER (supprimer) un module médical", () => { for (const r of Object.keys(ROLES)) for (const m of MODULES_MEDICAUX) expect(peut({ id: "u", roles: [r] }, m, "ARCHIVER")).toBe(false); });
});
