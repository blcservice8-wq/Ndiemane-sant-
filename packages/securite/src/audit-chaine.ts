import { createHash } from "node:crypto";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const stable = (v: unknown): string => v === null || typeof v !== "object" ? JSON.stringify(v ?? null) : Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;

export type EntreeAudit = { seq: number; date: string; utilisateurId: string | null; action: string; entite: string | null; entiteId: string | null; details: unknown; hashPrec: string; hash: string };
export const GENESE = "0".repeat(64);
const calculer = (e: Omit<EntreeAudit, "hash">) => sha(stable([e.seq, e.date, e.utilisateurId, e.action, e.entite, e.entiteId, e.details, e.hashPrec]));

/** Journal d'audit chaîné : chaque entrée contient le hachage de la précédente. Toute modification, suppression ou réordonnancement est détectable. */
export class ChaineAudit {
  entrees: EntreeAudit[] = [];
  ajouter(e: { utilisateurId?: string | null; action: string; entite?: string; entiteId?: string; details?: unknown }, date = new Date()): EntreeAudit {
    const base = { seq: this.entrees.length + 1, date: date.toISOString(), utilisateurId: e.utilisateurId ?? null, action: e.action, entite: e.entite ?? null, entiteId: e.entiteId ?? null, details: e.details ?? null,
      hashPrec: this.entrees.length ? this.entrees[this.entrees.length - 1].hash : GENESE };
    const entree = { ...base, hash: calculer(base) }; this.entrees.push(entree); return entree;
  }
  ancre() { return this.entrees.length ? this.entrees[this.entrees.length - 1].hash : GENESE; }
}
export type VerifChaine = { ok: true } | { ok: false; seq: number; raison: string };
/** `ancre` = dernier hachage conservé HORS de la base (autre support) : permet de détecter la suppression des dernières entrées. */
export function verifierChaine(entrees: EntreeAudit[], ancre?: string): VerifChaine {
  let prec = GENESE;
  for (let i = 0; i < entrees.length; i++) {
    const e = entrees[i];
    if (e.seq !== i + 1) return { ok: false, seq: e.seq, raison: "Séquence rompue (entrée supprimée ou réordonnée)" };
    if (e.hashPrec !== prec) return { ok: false, seq: e.seq, raison: "Chaînage rompu" };
    const { hash, ...reste } = e; if (calculer(reste) !== hash) return { ok: false, seq: e.seq, raison: "Contenu modifié" };
    prec = hash;
  }
  if (ancre !== undefined && prec !== ancre) return { ok: false, seq: entrees.length, raison: "Dernières entrées supprimées (ancre différente)" };
  return { ok: true };
}
