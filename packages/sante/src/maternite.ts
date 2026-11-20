const JOUR = 86_400_000;
/** Règle de Naegele : DPA = DDR + 280 jours. */
export const datePrevueAccouchement = (ddr: Date) => new Date(ddr.getTime() + 280 * JOUR);
export function ageGestationnel(ddr: Date, maintenant = new Date()) {
  const j = Math.floor((maintenant.getTime() - ddr.getTime()) / JOUR);
  return { semaines: Math.floor(j / 7), jours: j % 7, totalJours: j };
}
export function validerDDR(ddr: Date, maintenant = new Date()): string[] {
  const j = (maintenant.getTime() - ddr.getTime()) / JOUR;
  return j < 0 ? ["DDR dans le futur"] : j > 310 ? ["DDR trop ancienne pour une grossesse en cours"] : [];
}
/** Le calendrier des visites CPN (semaines) est un paramètre à valider par le responsable. */
export function prochaineVisiteCPN(ddr: Date, visitesFaites: number, calendrierSemaines: number[]): Date | null {
  const s = calendrierSemaines[visitesFaites];
  return s === undefined ? null : new Date(ddr.getTime() + s * 7 * JOUR);
}
