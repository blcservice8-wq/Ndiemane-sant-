const JOUR = 86_400_000;
export type Convention = { id: string; partenaireId: string; objet: string; debut: Date; fin: Date | null; montantFcfa: number | null };
export function validerConvention(c: Pick<Convention, "objet" | "debut" | "fin" | "montantFcfa">): string[] {
  const e: string[] = []; if (!c.objet?.trim()) e.push("Objet obligatoire");
  if (c.fin && c.fin < c.debut) e.push("La fin précède le début"); if (c.montantFcfa != null && c.montantFcfa < 0) e.push("Montant négatif"); return e;
}
export type StatutConvention = "A_VENIR" | "ACTIVE" | "EXPIREE";
export function statutConvention(c: Convention, maintenant: Date): StatutConvention {
  if (c.debut > maintenant) return "A_VENIR"; return c.fin && c.fin < maintenant ? "EXPIREE" : "ACTIVE";
}
export const conventionsExpirantes = (cs: Convention[], maintenant: Date, preavisJours = 90) =>
  cs.filter((c) => statutConvention(c, maintenant) === "ACTIVE" && c.fin && c.fin.getTime() - maintenant.getTime() <= preavisJours * JOUR)
    .map((c) => ({ ...c, joursRestants: Math.ceil((c.fin!.getTime() - maintenant.getTime()) / JOUR) })).sort((a, b) => a.joursRestants - b.joursRestants);
export const partenairesActifs = (cs: Convention[], maintenant: Date) => [...new Set(cs.filter((c) => statutConvention(c, maintenant) === "ACTIVE").map((c) => c.partenaireId))];

export type Contribution = { conventionId: string; montantFcfa: number; nature: "FINANCIERE" | "NATURE" };
/** Taux d'exécution = contributions reçues / montant convenu. null si aucun montant convenu. */
export function suiviContributions(c: Convention, contributions: Contribution[]) {
  const recu = contributions.filter((x) => x.conventionId === c.id).reduce((s, x) => s + x.montantFcfa, 0);
  return { recu, convenu: c.montantFcfa, taux: c.montantFcfa ? Math.round((recu / c.montantFcfa) * 1000) / 10 : null, reste: c.montantFcfa != null ? Math.max(0, c.montantFcfa - recu) : null };
}
/** Un partenaire ne reçoit que des agrégats : jamais de données patient. */
export function rapportPartenaire(c: Convention, indicateurs: { libelle: string; valeur: number }[], suivi: ReturnType<typeof suiviContributions>) {
  return { objet: c.objet, periode: { debut: c.debut, fin: c.fin }, indicateurs: indicateurs.map((i) => ({ libelle: i.libelle, valeur: i.valeur })), contributions: suivi };
}
