// Démarrage du serveur (non couvert par les tests : nécessite PostgreSQL). Lancer : npm run api
import { PrismaClient } from "@prisma/client";
import { construireApp } from "./app.js";
import { lireConfig } from "./config.js";
import { creerAuditPrisma, creerDepotPrisma, type PrismaLike } from "./depot-prisma.js";

const config = lireConfig(process.env);
const prisma = new PrismaClient();
const p = prisma as unknown as PrismaLike;
const site = await p.site.findUnique({ where: { code: config.codeSite } });
if (!site) { console.error(`Site « ${config.codeSite} » introuvable. Créez-le avec le premier administrateur : npm run admin:creer`); process.exit(1); }
const app = await construireApp({ depot: creerDepotPrisma(p), creerAudit: creerAuditPrisma(p, site.id), secret: config.secret, production: config.production, trustProxy: config.trustProxy, logger: true });
await app.listen({ port: config.port, host: config.hote });
