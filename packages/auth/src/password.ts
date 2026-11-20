import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64;
const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) =>
    scrypt(pw, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? rej(e) : res(k))));

export function validerComplexite(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 10) e.push("Minimum 10 caractères");
  if (!/[a-z]/.test(pw)) e.push("Une minuscule requise");
  if (!/[A-Z]/.test(pw)) e.push("Une majuscule requise");
  if (!/\d/.test(pw)) e.push("Un chiffre requis");
  if (!/[^A-Za-z0-9]/.test(pw)) e.push("Un caractère spécial requis");
  return e;
}
export async function hacher(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const k = await scryptAsync(pw, salt);
  return `scrypt$${N}$${salt.toString("base64")}$${k.toString("base64")}`;
}
export async function verifier(pw: string, hash: string): Promise<boolean> {
  const [algo, , s, h] = hash.split("$");
  if (algo !== "scrypt" || !s || !h) return false;
  const k = await scryptAsync(pw, Buffer.from(s, "base64"));
  const ref = Buffer.from(h, "base64");
  return ref.length === k.length && timingSafeEqual(ref, k);
}
