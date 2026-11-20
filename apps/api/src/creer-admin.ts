import { hacher, validerComplexite } from "../../../packages/auth/src/password.js";
import { genererSecret } from "../../../packages/auth/src/totp.js";
import { AVEC_ROLES_EXPORT, type PrismaLike } from "./depot-prisma.js";

export type EntreeAdmin = { email: string; motDePasse: string; nomComplet: string; codeSite: string; avecMfa: boolean };
/** Crée le site (s'il manque) et le premier compte ADMIN_SYSTEME. Prérequis : `npm run db:seed` (rôles). */
export async function creerAdmin(p: PrismaLike, e: EntreeAdmin) {
  const email = e.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Adresse e-mail invalide");
  const faiblesses = validerComplexite(e.motDePasse); if (faiblesses.length) throw new Error(`Mot de passe trop faible : ${faiblesses.join(", ")}`);
  if (!e.nomComplet.trim()) throw new Error("Nom complet obligatoire");
  if (await p.utilisateur.findUnique({ where: { email }, include: AVEC_ROLES_EXPORT })) throw new Error("Un compte existe déjà avec cette adresse");
  const site = (await p.site.findUnique({ where: { code: e.codeSite } })) ?? (await p.site.create({ data: { code: e.codeSite, nom: "Poste de Santé de Ndiemane", district: "Joal-Fadiouth", region: "Thiès" } }));
  const mfaSecret = e.avecMfa ? genererSecret() : null;
  try {
    const { id } = await p.utilisateur.create({ data: { siteId: site.id, email, nomComplet: e.nomComplet.trim(), motDePasseHash: await hacher(e.motDePasse), mfaSecret,
      roles: { create: [{ role: { connect: { code: "ADMIN_SYSTEME" } } }] } } });
    return { id, mfaSecret, otpauth: mfaSecret ? `otpauth://totp/NDIEMANE:${encodeURIComponent(email)}?secret=${mfaSecret}&issuer=NDIEMANE` : null };
  } catch (err) {
    if ((err as { code?: string }).code === "P2025") throw new Error("Rôle ADMIN_SYSTEME introuvable : lancez d'abord `npm run db:seed`");
    throw err;
  }
}
