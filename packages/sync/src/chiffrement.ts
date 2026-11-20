import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
/** Chiffrement AES-256-GCM des charges stockées localement (outbox, cache) : aucune donnée médicale en clair au repos. */
export function chiffrer(valeur: unknown, secret: string): string {
  const sel = randomBytes(16), iv = randomBytes(12), cle = scryptSync(secret, sel, 32);
  const c = createCipheriv("aes-256-gcm", cle, iv); const ct = Buffer.concat([c.update(JSON.stringify(valeur), "utf8"), c.final()]);
  return ["v1", sel, iv, c.getAuthTag(), ct].map((x) => (typeof x === "string" ? x : x.toString("base64"))).join(".");
}
export function dechiffrer<T = unknown>(jeton: string, secret: string): T {
  const [v, sel, iv, tag, ct] = jeton.split("."); if (v !== "v1" || !ct) throw new Error("Format inconnu");
  const d = createDecipheriv("aes-256-gcm", scryptSync(secret, Buffer.from(sel, "base64"), 32), Buffer.from(iv, "base64")); d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8")) as T;
}
/** Stock dérivé : détecte les lots passés en négatif après fusion de ventes hors connexion. */
export function lotsNegatifs(mouvements: { lotId: string; quantite: number }[]) {
  const m = new Map<string, number>(); for (const x of mouvements) m.set(x.lotId, (m.get(x.lotId) ?? 0) + x.quantite);
  return [...m].filter(([, q]) => q < 0).map(([lotId, quantite]) => ({ lotId, quantite }));
}
