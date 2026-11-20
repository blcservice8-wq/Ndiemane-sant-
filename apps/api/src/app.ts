import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import { connecter, type Audit, type CompteAuth, type DepotAuth } from "../../../packages/auth/src/auth-service.js";
import { emettre, lire } from "../../../packages/auth/src/session.js";
import { droitsEffectifs } from "../../../packages/auth/src/rbac.js";
import { LimiteurDebit, enTetesSecurite } from "../../../packages/securite/src/protection.js";
import { PAGE_CONNEXION, JS_CONNEXION } from "./pages.js";

export const NOM_COOKIE = "ndiemane_session";
const DUREE_SESSION_SEC = 8 * 3600;
export type DepotApi = DepotAuth & { parId(id: string): Promise<CompteAuth | null> };
export type Deps = {
  depot: DepotApi; creerAudit(ctx: { ip: string }): Audit; secret: string; production: boolean;
  trustProxy?: boolean; logger?: boolean; maintenant?: () => Date; limiteur?: LimiteurDebit;
};
type CorpsLogin = { email: string; motDePasse: string; codeMfa?: string };
const MESSAGES: Record<number, string> = { 400: "Requête invalide.", 413: "Requête trop volumineuse.", 415: "Format non pris en charge.", 429: "Trop de requêtes." };

const vueUtilisateur = (c: CompteAuth) => ({ id: c.id, email: c.email, nomComplet: c.nomComplet ?? null, roles: c.roles });

export async function construireApp(deps: Deps) {
  // Validation stricte : pas de suppression silencieuse des champs inconnus, pas de conversion automatique de types.
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 10_240, trustProxy: deps.trustProxy ?? false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } } });
  await app.register(cookie);
  const maintenant = deps.maintenant ?? (() => new Date());
  const limiteur = deps.limiteur ?? new LimiteurDebit(20, 15 * 60_000);
  const optionsCookie = { httpOnly: true, sameSite: "strict" as const, secure: deps.production, path: "/" };

  app.addHook("onSend", async (_req, rep, payload) => { for (const [k, v] of Object.entries(enTetesSecurite())) rep.header(k, v); return payload; });
  app.setErrorHandler((err: FastifyError, req, rep) => {
    const code = err.statusCode ?? 500;
    if (err.validation) return rep.code(400).send({ code: "REQUETE_INVALIDE", message: MESSAGES[400] });
    if (code >= 400 && code < 500) return rep.code(code).send({ code: "REQUETE_REFUSEE", message: MESSAGES[code] ?? "Requête refusée." });
    req.log.error(err);
    return rep.code(500).send({ code: "ERREUR_INTERNE", message: "Erreur interne." }); // aucun détail technique vers le client
  });

  app.get("/", async (_req, rep) => rep.redirect("/connexion"));
  app.get("/connexion", async (_req, rep) => rep.type("text/html; charset=utf-8").send(PAGE_CONNEXION));
  app.get("/connexion.js", async (_req, rep) => rep.type("application/javascript; charset=utf-8").send(JS_CONNEXION));
  app.get("/api/sante", async () => ({ ok: true, service: "ndiemane-api" }));

  app.post<{ Body: CorpsLogin }>("/api/auth/login", {
    schema: { body: { type: "object", required: ["email", "motDePasse"], additionalProperties: false,
      properties: { email: { type: "string", minLength: 3, maxLength: 254 }, motDePasse: { type: "string", minLength: 1, maxLength: 200 }, codeMfa: { type: "string", pattern: "^[0-9]{6}$" } } } },
  }, async (req, rep) => {
    const now = maintenant();
    const lim = limiteur.autoriser(`login:${req.ip}`, now.getTime());
    if (!lim.ok) { rep.header("Retry-After", Math.ceil(lim.reessayerApresMs / 1000)); return rep.code(429).send({ code: "TROP_DE_TENTATIVES", message: "Trop de tentatives. Réessayez plus tard." }); }
    const { email, motDePasse, codeMfa } = req.body;
    const r = await connecter(deps.depot, deps.creerAudit({ ip: req.ip }), deps.secret, email, motDePasse, codeMfa, now);
    if (!r.ok) {
      if (r.raison === "VERROUILLE") return rep.code(423).send({ code: "VERROUILLE", message: "Compte temporairement verrouillé. Réessayez dans 15 minutes." });
      if (r.raison === "MFA_REQUIS") return rep.code(401).send({ code: "MFA_REQUIS", message: "Saisissez le code à 6 chiffres de votre application d'authentification." });
      // Même réponse pour identifiant inconnu, mauvais mot de passe, mauvais code, compte inactif : pas d'énumération de comptes.
      return rep.code(401).send({ code: "IDENTIFIANTS", message: "Identifiants incorrects." });
    }
    const charge = lire(r.jeton, deps.secret, now.getTime());
    const compte = charge ? await deps.depot.parId(charge.sub) : null;
    if (!compte) return rep.code(500).send({ code: "ERREUR_INTERNE", message: "Erreur interne." });
    rep.setCookie(NOM_COOKIE, r.jeton, { ...optionsCookie, maxAge: DUREE_SESSION_SEC });
    return { utilisateur: vueUtilisateur(compte) };
  });

  app.get("/api/me", async (req, rep) => {
    const jeton = req.cookies[NOM_COOKIE];
    const charge = jeton ? lire(jeton, deps.secret, maintenant().getTime()) : null;
    const compte = charge ? await deps.depot.parId(charge.sub) : null;
    if (!compte || compte.statut !== "ACTIF") { if (jeton) rep.clearCookie(NOM_COOKIE, optionsCookie); return rep.code(401).send({ code: "NON_CONNECTE", message: "Connexion requise." }); }
    // Les rôles sont relus en base à chaque appel : un retrait de droits ou une suspension prend effet immédiatement.
    return { utilisateur: vueUtilisateur(compte), droits: droitsEffectifs({ id: compte.id, roles: compte.roles }) };
  });

  app.post("/api/auth/logout", async (req, rep) => {
    const jeton = req.cookies[NOM_COOKIE];
    const charge = jeton ? lire(jeton, deps.secret, maintenant().getTime()) : null;
    if (charge) await deps.creerAudit({ ip: req.ip }).log({ action: "LOGOUT", utilisateurId: charge.sub });
    rep.clearCookie(NOM_COOKIE, optionsCookie);
    return rep.code(204).send();
  });
  return app;
}
