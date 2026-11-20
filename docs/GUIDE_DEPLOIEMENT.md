# Guide de déploiement

> **Statut** : les modules métier sont testés, mais l'API (NestJS), l'interface (Next.js), l'intégration Prisma/PostgreSQL et les images Docker **n'existent pas encore**. Ce guide décrit la cible ; `docker-compose.prod.yml` n'a pas été exécuté.

## Architecture cible
- **Serveur local** (poste de santé) : PostgreSQL + API + web, accessibles sur le réseau local. Fonctionne sans Internet.
- **Serveur cloud** : même pile, derrière HTTPS (Caddy), base centrale et sauvegardes hors site.
- Synchronisation local <-> cloud par la file d'opérations (`packages/sync`).

## Matériel du serveur local (à confirmer par le responsable)
Mini-PC ou serveur, disque SSD chiffré, onduleur (coupures d'électricité), accès réseau local limité (pare-feu), alimentation solaire si applicable.

## Étapes
1. Installer Docker, créer `infra/secrets/db_password.txt` et `infra/.env` (secrets réels, jamais dans Git).
2. `docker compose -f infra/docker-compose.prod.yml up -d`.
3. Appliquer les migrations Prisma, charger le seed des rôles et permissions (`genererSeed`).
4. Créer le premier compte administrateur, activer la double authentification.
5. Configurer la sauvegarde (voir procédure) et **réussir un test de restauration**.
6. Activer le pare-feu : seuls 80/443 ouverts ; PostgreSQL jamais exposé.
7. Former le personnel, puis période de pilote avec des données fictives.
