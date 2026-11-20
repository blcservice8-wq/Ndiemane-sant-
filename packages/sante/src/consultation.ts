export type Constantes = { poids?: number; taille?: number; temperature?: number; tensionSys?: number; tensionDia?: number; pouls?: number };
export function validerConstantes(c: Constantes): string[] {
  const e: string[] = [];
  const dans = (v: number | undefined, min: number, max: number, nom: string) => { if (v !== undefined && !(v >= min && v <= max)) e.push(`${nom} hors plage (${min}-${max})`); };
  dans(c.poids, 0.3, 300, "Poids (kg)"); dans(c.taille, 20, 250, "Taille (cm)"); dans(c.temperature, 30, 45, "Température (°C)");
  dans(c.tensionSys, 40, 300, "Tension systolique"); dans(c.tensionDia, 20, 200, "Tension diastolique"); dans(c.pouls, 20, 300, "Pouls");
  if (c.tensionSys !== undefined && c.tensionDia !== undefined && c.tensionDia >= c.tensionSys) e.push("Diastolique doit être inférieure à la systolique");
  return e;
}
export const imc = (poids?: number, tailleCm?: number) => poids && tailleCm ? Math.round((poids / (tailleCm / 100) ** 2) * 10) / 10 : null;
/** Signaux d'attention affichés au soignant, jamais un diagnostic. */
export function signaux(c: Constantes): string[] {
  const s: string[] = [];
  if (c.temperature !== undefined && c.temperature >= 38) s.push("Fièvre");
  if (c.tensionSys !== undefined && c.tensionSys >= 140) s.push("Tension systolique élevée");
  if (c.tensionDia !== undefined && c.tensionDia >= 90) s.push("Tension diastolique élevée");
  return s;
}
export type ConsultationEntree = { motif: string; constantes: Constantes; diagnostics: { libelle: string; codeCim10?: string; principal?: boolean }[] };
export function validerConsultation(c: ConsultationEntree): string[] {
  const e = validerConstantes(c.constantes);
  if (!c.motif?.trim()) e.push("Motif obligatoire");
  if (c.diagnostics.length && c.diagnostics.filter((d) => d.principal).length !== 1) e.push("Un seul diagnostic principal requis");
  for (const d of c.diagnostics) if (d.codeCim10 && !/^[A-Z]\d{2}(\.\d{1,2})?$/.test(d.codeCim10)) e.push(`Code CIM-10 invalide : ${d.codeCim10}`);
  return e;
}
