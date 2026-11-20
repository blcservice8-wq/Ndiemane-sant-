import { createHmac, timingSafeEqual } from "node:crypto";
type Charge = { sub: string; exp: number; roles: string[] };
const b64 = (s: string) => Buffer.from(s).toString("base64url");
export function emettre(c: Omit<Charge, "exp">, secret: string, dureeSec = 8 * 3600, maintenant = Date.now()): string {
  const corps = b64(JSON.stringify({ ...c, exp: Math.floor(maintenant / 1000) + dureeSec }));
  return `${corps}.${createHmac("sha256", secret).update(corps).digest("base64url")}`;
}
export function lire(jeton: string, secret: string, maintenant = Date.now()): Charge | null {
  const [corps, sig] = jeton.split(".");
  if (!corps || !sig) return null;
  const att = createHmac("sha256", secret).update(corps).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(att);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const c = JSON.parse(Buffer.from(corps, "base64url").toString()) as Charge;
  return c.exp * 1000 > maintenant ? c : null;
}
