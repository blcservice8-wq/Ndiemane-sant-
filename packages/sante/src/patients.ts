import { exiger, type Utilisateur } from "../../auth/src/rbac.js";

export type NouveauPatient = { nom: string; prenom: string; sexe: "M" | "F"; dateNaissance?: Date | null; telephone?: string; localite?: string; adresse?: string };
export type PatientExistant = NouveauPatient & { id: string; numeroDossier: string };

export const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function empreinteDoublon(p: Pick<NouveauPatient, "nom" | "prenom" | "dateNaissance" | "localite">): string {
  const nais = p.dateNaissance ? p.dateNaissance.toISOString().slice(0, 10) : "";
  return [normaliser(p.nom), normaliser(p.prenom), nais, normaliser(p.localite ?? "")].join("|");
}
export function distance(a: string, b: string): number {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur; }
  return prev[n];
}
/** Score 0..1 : 1 = identique. Date de naissance identique = indice fort. */
export function scoreDoublon(a: NouveauPatient, b: NouveauPatient): number {
  const na = normaliser(`${a.nom} ${a.prenom}`), nb = normaliser(`${b.nom} ${b.prenom}`);
  const sim = 1 - distance(na, nb) / Math.max(na.length, nb.length, 1);
  const memeNais = a.dateNaissance && b.dateNaissance && a.dateNaissance.getTime() === b.dateNaissance.getTime();
  const memeSexe = a.sexe === b.sexe;
  return memeSexe ? Math.min(1, sim * (memeNais ? 1 : 0.85) + (memeNais ? 0.05 : 0)) : sim * 0.5;
}
export const SEUIL_DOUBLON = 0.85;
export function candidatsDoublon(nouveau: NouveauPatient, existants: PatientExistant[]) {
  return existants.map((p) => ({ patient: p, score: scoreDoublon(nouveau, p) }))
    .filter((x) => x.score >= SEUIL_DOUBLON).sort((a, b) => b.score - a.score);
}
export const formaterNumero = (codeSite: string, annee: number, seq: number) => `${codeSite}-${annee}-${String(seq).padStart(6, "0")}`;

export function validerPatient(p: NouveauPatient, maintenant = new Date()): string[] {
  const e: string[] = [];
  if (!p.nom?.trim()) e.push("Nom obligatoire");
  if (!p.prenom?.trim()) e.push("Prénom obligatoire");
  if (!["M", "F"].includes(p.sexe)) e.push("Sexe obligatoire");
  if (p.dateNaissance && (p.dateNaissance > maintenant || maintenant.getUTCFullYear() - p.dateNaissance.getUTCFullYear() > 120)) e.push("Date de naissance invalide");
  if (p.telephone && !/^\+?[0-9]{8,15}$/.test(p.telephone.replace(/[ .-]/g, ""))) e.push("Téléphone invalide");
  return e;
}
export function age(naissance: Date, maintenant = new Date()) {
  let ans = maintenant.getUTCFullYear() - naissance.getUTCFullYear();
  let mois = maintenant.getUTCMonth() - naissance.getUTCMonth();
  if (maintenant.getUTCDate() < naissance.getUTCDate()) mois--;
  if (mois < 0) { ans--; mois += 12; }
  return { ans, mois, totalMois: ans * 12 + mois };
}

export interface DepotPatients {
  tous(siteId: string): Promise<PatientExistant[]>;
  prochainSequence(siteId: string, annee: number): Promise<number>;
  creer(p: NouveauPatient & { siteId: string; numeroDossier: string; empreinteDoublon: string }): Promise<{ id: string }>;
}
export interface Audit { log(e: { action: string; utilisateurId?: string; entite?: string; entiteId?: string }): Promise<void> }

export type ResultatCreation =
  | { statut: "CREE"; id: string; numeroDossier: string }
  | { statut: "DOUBLON_POSSIBLE"; candidats: { numeroDossier: string; nom: string; prenom: string; score: number }[] }
  | { statut: "INVALIDE"; erreurs: string[] };

export async function creerPatient(d: DepotPatients, a: Audit, u: Utilisateur, site: { id: string; code: string },
  p: NouveauPatient, opts: { confirmerNonDoublon?: boolean; maintenant?: Date } = {}): Promise<ResultatCreation> {
  exiger(u, "patients", "CREER");
  const maintenant = opts.maintenant ?? new Date();
  const erreurs = validerPatient(p, maintenant);
  if (erreurs.length) return { statut: "INVALIDE", erreurs };
  if (!opts.confirmerNonDoublon) {
    const c = candidatsDoublon(p, await d.tous(site.id));
    if (c.length) return { statut: "DOUBLON_POSSIBLE", candidats: c.map((x) => ({ numeroDossier: x.patient.numeroDossier, nom: x.patient.nom, prenom: x.patient.prenom, score: Math.round(x.score * 100) / 100 })) };
  }
  const annee = maintenant.getUTCFullYear();
  const numeroDossier = formaterNumero(site.code, annee, await d.prochainSequence(site.id, annee));
  const { id } = await d.creer({ ...p, siteId: site.id, numeroDossier, empreinteDoublon: empreinteDoublon(p) });
  await a.log({ action: "PATIENT_CREE", utilisateurId: u.id, entite: "Patient", entiteId: id });
  return { statut: "CREE", id, numeroDossier };
}
