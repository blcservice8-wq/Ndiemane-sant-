import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

function chiffrerOctets(data: Buffer, secret: string): string {
  const sel = randomBytes(16), iv = randomBytes(12), c = createCipheriv("aes-256-gcm", scryptSync(secret, sel, 32), iv);
  const ct = Buffer.concat([c.update(data), c.final()]); return ["v1", sel, iv, c.getAuthTag(), ct].map((x) => (typeof x === "string" ? x : x.toString("base64"))).join(".");
}
function dechiffrerOctets(jeton: string, secret: string): Buffer {
  const [v, sel, iv, tag, ct] = jeton.split("."); if (v !== "v1" || !ct) throw new Error("Format de sauvegarde inconnu");
  const d = createDecipheriv("aes-256-gcm", scryptSync(secret, Buffer.from(sel, "base64"), 32), Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
  try { return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]); } catch { throw new Error("Déchiffrement impossible : mauvaise clé ou sauvegarde altérée"); }
}
/** Le manifeste ne contient que des comptages : aucune donnée personnelle. */
export type Manifeste = { version: 1; creeLe: string; siteId: string; tables: Record<string, number>; sha256: string };
export type Sauvegarde = { manifeste: Manifeste; contenuChiffre: string };
export type Donnees = Record<string, unknown[]>;

export function creerSauvegarde(donnees: Donnees, secret: string, siteId: string, maintenant = new Date()): Sauvegarde {
  if (secret.length < 12) throw new Error("Clé de sauvegarde trop courte (12 caractères minimum)");
  const json = JSON.stringify(donnees);
  return { manifeste: { version: 1, creeLe: maintenant.toISOString(), siteId, tables: Object.fromEntries(Object.entries(donnees).map(([k, v]) => [k, v.length])), sha256: sha(json) }, contenuChiffre: chiffrerOctets(gzipSync(Buffer.from(json)), secret) };
}
export function restaurer(s: Sauvegarde, secret: string): Donnees {
  const json = gunzipSync(dechiffrerOctets(s.contenuChiffre, secret)).toString("utf8");
  if (sha(json) !== s.manifeste.sha256) throw new Error("Sauvegarde corrompue : empreinte différente du manifeste");
  const d = JSON.parse(json) as Donnees;
  for (const [t, n] of Object.entries(s.manifeste.tables)) if ((d[t]?.length ?? -1) !== n) throw new Error(`Table ${t} incohérente avec le manifeste`);
  return d;
}
/** Test de restauration : à exécuter régulièrement, pas seulement le jour d'une panne. */
export function testerRestauration(s: Sauvegarde, secret: string, source: Donnees) {
  try { const r = restaurer(s, secret); const identique = JSON.stringify(r) === JSON.stringify(source); return { ok: identique, erreur: identique ? null : "Données restaurées différentes de la source" }; }
  catch (e) { return { ok: false, erreur: (e as Error).message }; }
}

// ---------- Rétention ----------
export type Retention = { quotidiennes: number; hebdomadaires: number; mensuelles: number };
const jour = (d: Date) => d.toISOString().slice(0, 10);
const lundi = (d: Date) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return jour(x); };
const mois = (d: Date) => d.toISOString().slice(0, 7);
/** Conserve la plus récente par jour (N jours), par semaine (N semaines) et par mois (N mois). Renvoie les dates à supprimer. */
export function aSupprimer(dates: Date[], r: Retention): Date[] {
  const tri = [...dates].sort((a, b) => b.getTime() - a.getTime()); const garde = new Set<number>();
  const garder = (cle: (d: Date) => string, n: number) => { const vus = new Set<string>(); for (const d of tri) { const k = cle(d); if (vus.has(k)) continue; if (vus.size >= n) break; vus.add(k); garde.add(d.getTime()); } };
  garder(jour, r.quotidiennes); garder(lundi, r.hebdomadaires); garder(mois, r.mensuelles);
  return tri.filter((d) => !garde.has(d.getTime()));
}
