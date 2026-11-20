import { createHmac, randomBytes } from "node:crypto";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function genererSecret(): string {
  const b = randomBytes(20); let bits = "", out = "";
  for (const x of b) bits += x.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function decode(s: string): Buffer {
  let bits = ""; for (const c of s.replace(/=+$/, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
export function code(secret: string, tMs = Date.now(), step = 30): string {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(tMs / 1000 / step)));
  const h = createHmac("sha1", decode(secret)).update(ctr).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
export function verifierCode(secret: string, saisi: string, tMs = Date.now()): boolean {
  return [-1, 0, 1].some((d) => code(secret, tMs + d * 30_000) === saisi);
}
