// Indicateurs CONFIGURABLES : définis en données (JSON), pas en dur, pour coller aux outils officiels du district.
export type Ligne = Record<string, string | number | boolean | Date | null>;
export type Jeux = Record<string, Ligne[]>;
export type Condition = { champ: string; egal?: unknown; dans?: unknown[]; min?: number; max?: number };
export type Compte = { code: string; libelle: string; op: "COUNT"; jeu: string; champDate: string; ou?: Condition[] };
export type Somme = { code: string; libelle: string; op: "SUM"; jeu: string; champDate: string; champ: string; ou?: Condition[] };
export type Ratio = { code: string; libelle: string; op: "RATIO"; numerateur: string; denominateur: string; pour?: number }; // codes d'autres indicateurs
export type DefIndicateur = Compte | Somme | Ratio;
export type Periode = { debut: Date; fin: Date };

const ok = (l: Ligne, c: Condition) => { const v = l[c.champ];
  if (c.egal !== undefined && v !== c.egal) return false; if (c.dans && !c.dans.includes(v)) return false;
  if (c.min !== undefined && !(typeof v === "number" && v >= c.min)) return false; if (c.max !== undefined && !(typeof v === "number" && v <= c.max)) return false; return true; };

export function calculer(defs: DefIndicateur[], jeux: Jeux, p: Periode): Record<string, number | null> {
  const res: Record<string, number | null> = {}; const enCours = new Set<string>();
  const get = (code: string): number | null => {
    if (code in res) return res[code]; if (enCours.has(code)) throw new Error(`Indicateur circulaire : ${code}`);
    const d = defs.find((x) => x.code === code); if (!d) throw new Error(`Indicateur inconnu : ${code}`); enCours.add(code);
    let v: number | null;
    if (d.op === "RATIO") { const n = get(d.numerateur), m = get(d.denominateur); v = n === null || !m ? null : Math.round((n / m) * (d.pour ?? 100) * 10) / 10; }
    else {
      const lignes = (jeux[d.jeu] ?? []).filter((l) => { const t = l[d.champDate]; return t instanceof Date && t >= p.debut && t <= p.fin && (d.ou ?? []).every((c) => ok(l, c)); });
      v = d.op === "COUNT" ? lignes.length : lignes.reduce((s, l) => s + (typeof l[d.champ] === "number" ? (l[d.champ] as number) : 0), 0);
    }
    enCours.delete(code); return (res[code] = v);
  };
  for (const d of defs) get(d.code); return res;
}
export function validerDefinitions(defs: DefIndicateur[]): string[] {
  const e: string[] = []; const codes = defs.map((d) => d.code);
  if (new Set(codes).size !== codes.length) e.push("Codes d'indicateurs en double");
  for (const d of defs) if (d.op === "RATIO") for (const c of [d.numerateur, d.denominateur]) if (!codes.includes(c)) e.push(`${d.code} : indicateur ${c} inconnu`);
  return e;
}

// ---------- Périodes ----------
const U = (y: number, m: number, j: number, h = 0, mi = 0, s = 0, ms = 0) => new Date(Date.UTC(y, m, j, h, mi, s, ms));
export function periode(type: "JOUR" | "MOIS" | "TRIMESTRE" | "ANNEE", ref: Date): Periode {
  const y = ref.getUTCFullYear(), m = ref.getUTCMonth();
  switch (type) {
    case "JOUR": return { debut: U(y, m, ref.getUTCDate()), fin: U(y, m, ref.getUTCDate(), 23, 59, 59, 999) };
    case "MOIS": return { debut: U(y, m, 1), fin: U(y, m + 1, 0, 23, 59, 59, 999) };
    case "TRIMESTRE": { const t = Math.floor(m / 3) * 3; return { debut: U(y, t, 1), fin: U(y, t + 3, 0, 23, 59, 59, 999) }; }
    case "ANNEE": return { debut: U(y, 0, 1), fin: U(y, 11, 31, 23, 59, 59, 999) };
  }
}
/** Protection contre la ré-identification : masque les petits effectifs pour les rapports externes. */
export const masquerPetitsEffectifs = (v: number | null, seuil: number): number | string | null => v !== null && v > 0 && v < seuil ? `<${seuil}` : v;
