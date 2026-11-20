// Adaptateur PostgreSQL. Il ne dépend que d'un sous-ensemble structurel de PrismaClient (PrismaLike) :
// la logique est ainsi testable sans base, et le vrai client s'y branche dans main.ts.
import type { Audit, CompteAuth } from "../../../packages/auth/src/auth-service.js";
import type { DepotApi } from "./app.js";

export type LigneUtilisateur = { id: string; siteId: string; email: string; nomComplet: string; motDePasseHash: string; mfaSecret: string | null;
  statut: "ACTIF" | "SUSPENDU" | "DESACTIVE"; tentativesEchec: number; verrouJusqua: Date | null; roles: { role: { code: string } }[] };
export const AVEC_ROLES_EXPORT = { roles: { include: { role: true as const } } };
const AVEC_ROLES = { roles: { include: { role: true as const } } };
export interface PrismaLike {
  utilisateur: {
    findUnique(args: { where: { email: string } | { id: string }; include: typeof AVEC_ROLES }): Promise<LigneUtilisateur | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  journalAudit: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  site: { findUnique(args: { where: { code: string } }): Promise<{ id: string } | null>; create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}
const versCompte = (u: LigneUtilisateur): CompteAuth => ({ id: u.id, email: u.email, nomComplet: u.nomComplet, motDePasseHash: u.motDePasseHash, statut: u.statut,
  tentativesEchec: u.tentativesEchec, verrouJusqua: u.verrouJusqua, mfaSecret: u.mfaSecret, roles: u.roles.map((r) => r.role.code) });

export function creerDepotPrisma(p: PrismaLike): DepotApi {
  return {
    parEmail: async (email) => { const u = await p.utilisateur.findUnique({ where: { email }, include: AVEC_ROLES }); return u ? versCompte(u) : null; },
    parId: async (id) => { const u = await p.utilisateur.findUnique({ where: { id }, include: AVEC_ROLES }); return u ? versCompte(u) : null; },
    enregistrerEchec: async (id, tentatives, verrouJusqua) => { await p.utilisateur.update({ where: { id }, data: { tentativesEchec: tentatives, verrouJusqua } }); },
    enregistrerSucces: async (id) => { await p.utilisateur.update({ where: { id }, data: { tentativesEchec: 0, verrouJusqua: null, derniereConnexion: new Date() } }); },
  };
}
export const creerAuditPrisma = (p: PrismaLike, siteId: string) => (ctx: { ip: string }): Audit => ({
  log: async (e) => { await p.journalAudit.create({ data: { siteId, utilisateurId: e.utilisateurId, action: e.action, entite: "Auth", ip: ctx.ip, apres: e.details ?? undefined } }); },
});
