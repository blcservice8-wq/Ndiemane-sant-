import { hacher, verifier } from "./password.js";
import { verifierCode } from "./totp.js";
import { emettre } from "./session.js";

export type CompteAuth = { id: string; email: string; nomComplet?: string; motDePasseHash: string; statut: "ACTIF"|"SUSPENDU"|"DESACTIVE";
  tentativesEchec: number; verrouJusqua: Date | null; mfaSecret: string | null; roles: string[] };
export interface DepotAuth {
  parEmail(email: string): Promise<CompteAuth | null>;
  enregistrerEchec(id: string, tentatives: number, verrouJusqua: Date | null): Promise<void>;
  enregistrerSucces(id: string): Promise<void>;
}
export interface Audit { log(e: { action: string; utilisateurId?: string; details?: unknown }): Promise<void> }
export const MAX_ECHECS = 5, VERROU_MIN = 15;
// Empreinte factice : un identifiant inconnu ou inactif coûte le même temps de calcul qu'un vrai compte (pas d'énumération par chronométrage).
let faux: Promise<string> | null = null;
const hashFactice = () => (faux ??= hacher("Facti$e-Mot2Passe-Inutilisable"));
export type Resultat =
  | { ok: true; jeton: string }
  | { ok: false; raison: "IDENTIFIANTS" | "VERROUILLE" | "MFA_REQUIS" | "MFA_INVALIDE" | "COMPTE_INACTIF" };

export async function connecter(d: DepotAuth, a: Audit, secret: string,
  email: string, motDePasse: string, codeMfa?: string, maintenant = new Date()): Promise<Resultat> {
  const c = await d.parEmail(email.trim().toLowerCase());
  if (!c) { await verifier(motDePasse, await hashFactice()); await a.log({ action: "LOGIN_ECHEC_INCONNU" }); return { ok: false, raison: "IDENTIFIANTS" }; }
  if (c.statut !== "ACTIF") { await verifier(motDePasse, c.motDePasseHash); await a.log({ action: "LOGIN_COMPTE_INACTIF", utilisateurId: c.id }); return { ok: false, raison: "COMPTE_INACTIF" }; }
  if (c.verrouJusqua && c.verrouJusqua > maintenant) { await a.log({ action: "LOGIN_VERROUILLE", utilisateurId: c.id }); return { ok: false, raison: "VERROUILLE" }; }

  const echec = async (raison: "IDENTIFIANTS" | "MFA_INVALIDE"): Promise<Resultat> => {
    const n = c.tentativesEchec + 1;
    const verrou = n >= MAX_ECHECS ? new Date(maintenant.getTime() + VERROU_MIN * 60_000) : null;
    await d.enregistrerEchec(c.id, verrou ? 0 : n, verrou);
    await a.log({ action: verrou ? "COMPTE_VERROUILLE" : "LOGIN_ECHEC", utilisateurId: c.id });
    return { ok: false, raison };
  };
  if (!(await verifier(motDePasse, c.motDePasseHash))) return echec("IDENTIFIANTS");
  if (c.mfaSecret) {
    if (!codeMfa) return { ok: false, raison: "MFA_REQUIS" };
    if (!verifierCode(c.mfaSecret, codeMfa, maintenant.getTime())) return echec("MFA_INVALIDE");
  }
  await d.enregistrerSucces(c.id);
  await a.log({ action: "LOGIN_SUCCES", utilisateurId: c.id });
  return { ok: true, jeton: emettre({ sub: c.id, roles: c.roles }, secret, undefined, maintenant.getTime()) };
}
