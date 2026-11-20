import { exiger, type Utilisateur } from "../../auth/src/rbac.js";
const JOUR = 86_400_000;
const jourUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ---------- Fiche ----------
export type Fiche = { nom: string; prenom: string; fonction: string; telephone?: string; dateEmbauche?: Date | null };
export function validerFiche(f: Fiche, maintenant = new Date()): string[] {
  const e: string[] = [];
  if (!f.nom?.trim()) e.push("Nom obligatoire");
  if (!f.prenom?.trim()) e.push("Prénom obligatoire");
  if (!f.fonction?.trim()) e.push("Fonction obligatoire");
  if (f.telephone && !/^\+?[0-9]{8,15}$/.test(f.telephone.replace(/[ .-]/g, ""))) e.push("Téléphone invalide");
  if (f.dateEmbauche && f.dateEmbauche > maintenant) e.push("Date d'embauche dans le futur");
  return e;
}

// ---------- Périodes ----------
export type Periode = { debut: Date; fin: Date | null }; // fin null = sans limite
export const seChevauchent = (a: Periode, b: Periode) =>
  a.debut <= (b.fin ?? new Date(8.64e15)) && b.debut <= (a.fin ?? new Date(8.64e15));
export const periodeValide = (p: Periode) => p.fin === null || p.fin >= p.debut;

// ---------- Contrats ----------
export function validerNouveauContrat(nouveau: Periode, existants: Periode[]): string[] {
  const e: string[] = [];
  if (!periodeValide(nouveau)) e.push("La fin précède le début");
  else if (existants.some((c) => seChevauchent(nouveau, c))) e.push("Chevauchement avec un contrat existant");
  return e;
}
export function contratsExpirants(contrats: { personnelId: string; fin: Date | null }[], maintenant: Date, joursPreavis = 60) {
  const lim = maintenant.getTime() + joursPreavis * JOUR;
  return contrats.filter((c) => c.fin && c.fin.getTime() >= maintenant.getTime() && c.fin.getTime() <= lim)
    .map((c) => ({ personnelId: c.personnelId, fin: c.fin!, joursRestants: Math.ceil((c.fin!.getTime() - maintenant.getTime()) / JOUR) }))
    .sort((a, b) => a.joursRestants - b.joursRestants);
}

// ---------- Congés ----------
/** Jours ouvrés (lundi-vendredi) entre deux dates incluses, hors jours fériés fournis (paramètre du poste). */
export function joursOuvres(debut: Date, fin: Date, feries: Date[] = []): number {
  const f = new Set(feries.map((d) => jourUTC(d).getTime())); let n = 0;
  for (let t = jourUTC(debut).getTime(); t <= jourUTC(fin).getTime(); t += JOUR) {
    const dow = new Date(t).getUTCDay(); if (dow !== 0 && dow !== 6 && !f.has(t)) n++;
  }
  return n;
}
export type Conge = { debut: Date; fin: Date; type: string; approuve: boolean };
export function validerDemandeConge(d: Conge, existants: Conge[], soldeAnnuelParametre: number, feries: Date[] = []): string[] {
  const e: string[] = [];
  if (d.fin < d.debut) return ["La fin précède le début"];
  if (existants.some((c) => c.approuve && seChevauchent({ debut: c.debut, fin: c.fin }, { debut: d.debut, fin: d.fin }))) e.push("Chevauchement avec un congé approuvé");
  if (d.type === "ANNUEL") {
    const annee = d.debut.getUTCFullYear();
    const pris = existants.filter((c) => c.approuve && c.type === "ANNUEL" && c.debut.getUTCFullYear() === annee)
      .reduce((s, c) => s + joursOuvres(c.debut, c.fin, feries), 0);
    if (pris + joursOuvres(d.debut, d.fin, feries) > soldeAnnuelParametre) e.push(`Solde de congés annuel insuffisant (reste ${Math.max(0, soldeAnnuelParametre - pris)} j)`);
  }
  return e;
}

// ---------- Présences ----------
export type Presence = { date: Date; present: boolean; motifAbsence?: string };
export function tauxPresence(p: Presence[]): number | null {
  return p.length ? Math.round((p.filter((x) => x.present).length / p.length) * 1000) / 10 : null;
}
export const absencesInjustifiees = (p: Presence[]) => p.filter((x) => !x.present && !x.motifAbsence?.trim()).length;

// ---------- Gardes ----------
export type Garde = { personnelId: string; debut: Date; fin: Date };
export function validerGarde(n: Garde, existantes: Garde[], repos_min_heures: number, conges: { personnelId: string; debut: Date; fin: Date }[] = []): string[] {
  const e: string[] = [];
  if (n.fin <= n.debut) return ["La fin précède le début"];
  const siennes = existantes.filter((g) => g.personnelId === n.personnelId);
  if (siennes.some((g) => g.debut < n.fin && n.debut < g.fin)) e.push("Chevauchement avec une autre garde du même agent");
  const H = 3_600_000;
  if (siennes.some((g) => (g.fin <= n.debut && n.debut.getTime() - g.fin.getTime() < repos_min_heures * H) || (n.fin <= g.debut && g.debut.getTime() - n.fin.getTime() < repos_min_heures * H)))
    e.push(`Repos minimal de ${repos_min_heures} h non respecté`);
  if (conges.some((c) => c.personnelId === n.personnelId && seChevauchent({ debut: c.debut, fin: c.fin }, { debut: n.debut, fin: n.fin }))) e.push("L'agent est en congé");
  return e;
}
export function chargeGardes(gardes: Garde[]) {
  const m = new Map<string, number>(); for (const g of gardes) m.set(g.personnelId, (m.get(g.personnelId) ?? 0) + 1); return m;
}

// ---------- Service ----------
export interface DepotPersonnel { creerFiche(siteId: string, f: Fiche): Promise<{ id: string }>; }
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string }): Promise<void> }
export async function creerFichePersonnel(d: DepotPersonnel, a: Audit, u: Utilisateur, siteId: string, f: Fiche) {
  exiger(u, "personnel", "CREER");
  const erreurs = validerFiche(f);
  if (erreurs.length) return { ok: false as const, erreurs };
  const { id } = await d.creerFiche(siteId, f);
  await a.log({ action: "PERSONNEL_CREE", utilisateurId: u.id, entite: "Personnel", entiteId: id });
  return { ok: true as const, id };
}
export async function approuverConge(a: Audit, u: Utilisateur, congeId: string) {
  exiger(u, "personnel", "VALIDER"); await a.log({ action: "CONGE_APPROUVE", utilisateurId: u.id, entite: "Conge", entiteId: congeId });
}
