// Création du premier administrateur (interactif, le mot de passe n'est pas affiché). Lancer : npm run admin:creer
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { creerAdmin } from "../creer-admin.js";
import type { PrismaLike } from "../depot-prisma.js";

function demander(question: string, masque = false): Promise<string> {
  let muet = false;
  const sortie = new Writable({ write(chunk, enc, cb) { if (!muet) process.stdout.write(chunk, enc); cb(); } });
  const rl = createInterface({ input: process.stdin, output: sortie, terminal: true });
  return new Promise((resolve) => { rl.question(question, (r) => { rl.close(); if (masque) process.stdout.write("\n"); resolve(r); }); muet = masque; });
}
const prisma = new PrismaClient();
try {
  const email = await demander("E-mail de l'administrateur : ");
  const nomComplet = await demander("Nom complet : ");
  const motDePasse = await demander("Mot de passe (10+ car., maj., min., chiffre, spécial) : ", true);
  const confirmation = await demander("Confirmez le mot de passe : ", true);
  if (motDePasse !== confirmation) throw new Error("Les mots de passe ne correspondent pas");
  const avecMfa = (await demander("Activer la double authentification (o/N) ? ")).trim().toLowerCase() === "o";
  const r = await creerAdmin(prisma as unknown as PrismaLike, { email, motDePasse, nomComplet, codeSite: process.env.SITE_CODE ?? "NDM", avecMfa });
  console.log(`\nAdministrateur créé (id ${r.id}).`);
  if (r.otpauth) console.log(`Double authentification : ajoutez ce secret dans votre application (Google Authenticator, etc.) : ${r.mfaSecret}\nLien : ${r.otpauth}`);
} catch (e) { console.error(`\nErreur : ${(e as Error).message}`); process.exitCode = 1; } finally { await prisma.$disconnect(); }
