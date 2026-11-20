export type EtapeCalendrier = { vaccin: string; dose: number; agePremierMois: number };
export type DoseFaite = { vaccin: string; dose: number };
/** Le calendrier vaccinal est une donnée de configuration, à valider avec le district (aucune valeur codée en dur). */
export function dosesManquantes(ageMois: number, calendrier: EtapeCalendrier[], faites: DoseFaite[]): EtapeCalendrier[] {
  return calendrier.filter((e) => e.agePremierMois <= ageMois && !faites.some((f) => f.vaccin === e.vaccin && f.dose === e.dose))
    .sort((a, b) => a.agePremierMois - b.agePremierMois);
}
export const prochaineDose = (ageMois: number, calendrier: EtapeCalendrier[], faites: DoseFaite[]) =>
  calendrier.filter((e) => e.agePremierMois > ageMois && !faites.some((f) => f.vaccin === e.vaccin && f.dose === e.dose))
    .sort((a, b) => a.agePremierMois - b.agePremierMois)[0] ?? null;
