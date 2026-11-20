# NDIEMANE SANTÉ DIGITAL

Plateforme de gestion du Poste de Santé de Ndiemane (district de Joal-Fadiouth, Sénégal).

## État du projet — à lire d'abord

| Élément | État |
|---|---|
| Logique métier des 12 modules (`packages/`) | ✅ **185 tests passent**, typage propre |
| Schéma de base de données (`prisma/schema.prisma`) | ✅ valide (60 modèles), 🔶 jamais appliqué sur une vraie base |
| Script de chargement des rôles (`prisma/seed.ts`) | 🔶 écrit, jamais exécuté |
| Scripts de sauvegarde / restauration (`infra/scripts`) | 🔶 syntaxe vérifiée seulement |
| API de connexion (Fastify, `apps/api`) | ✅ 31 tests + essai HTTP réel · 🔶 jamais branchée à PostgreSQL |
| Autres routes API (patients, pharmacie…) et interface Next.js | ❌ **pas encore développées** (Phase 15, suite) |

⚠️ **Ne saisissez aucune donnée de patient réelle.** Voir `docs/CHECKLIST_MISE_EN_PRODUCTION_ET_CDP.md`.

## Démarrer dans le navigateur (GitHub Codespaces, sans rien installer)

1. Sur github.com : **New repository** → nom `ndiemane-sante-digital` → **Private** → Create.
2. Dans le dépôt : **Code → Codespaces → Create codespace on main**.
3. Glissez le fichier `.zip` dans la colonne de gauche (Explorateur) du Codespace.
4. Dans le terminal (en bas) :
   ```bash
   unzip ndiemane-sante-digital.zip
   shopt -s dotglob && mv ndiemane-sante-digital/* . && rmdir ndiemane-sante-digital && rm ndiemane-sante-digital.zip
   ```
5. Palette de commandes (`F1`) → **Codespaces: Rebuild Container**. Attendre la fin : Node 22 + PostgreSQL sont installés automatiquement, `npm install` et `prisma generate` s'exécutent seuls.

## Vérifier que tout fonctionne (dans l'ordre)

```bash
npm run tests        # attendu : 12 modules, 185 tests passés
npm run typecheck    # attendu : aucune erreur
npm run db:validate  # attendu : "The schema at prisma/schema.prisma is valid"
npm run db:migrate   # crée les 60 tables dans PostgreSQL (dossier prisma/migrations)
npm run db:seed      # attendu : "OK : 12 rôles, 114 permissions"
npm run db:studio    # interface web pour parcourir la base
```

**Si une commande échoue : copiez-collez le message d'erreur complet** et envoyez-le moi, je corrige.

## Sans Codespaces (ordinateur avec Node 22 et PostgreSQL 16)

```bash
cp .env.example .env     # puis adapter DATABASE_URL
npm install
npm run tests && npm run db:validate && npm run db:migrate && npm run db:seed
```

## Contenu

```
packages/   auth, dashboard, sante, personnel, pharmalabo, patrimoine, tiers,
            communaute, finances, rapports, sync, securite   (logique + tests)
prisma/     schema.prisma (60 modèles), seed.ts
infra/      docker-compose.prod.yml, Caddyfile, scripts de sauvegarde (non testés)
docs/       guides administrateur, utilisateur, déploiement, sauvegarde, checklist CDP,
            apercu-tableau-de-bord.html (maquette, données de démonstration)
```

## Lancer l'API de connexion (Phase 15)

```bash
npm install
echo "SESSION_SECRET=\"$(openssl rand -base64 48)\"" >> .env     # une seule fois
npm run admin:creer     # crée le site + le premier administrateur (le mot de passe n'est pas affiché)
npm run api             # démarre l'API sur le port 4000
```
Puis, dans Codespaces : onglet **Ports** → ligne 4000 → icône « Ouvrir dans le navigateur », et ajoutez `/connexion` à l'adresse.
La page permet de se connecter, voir ses rôles et droits, et se déconnecter (fonctionne sur téléphone).

Limites connues : la session est un jeton signé de 8 h (la déconnexion efface le cookie mais ne peut pas révoquer le jeton avant son expiration ; en revanche un compte suspendu ou un rôle retiré prend effet **immédiatement**). Le journal d'audit en base n'est pas encore chaîné (voir `packages/securite`).

## Prochaine étape : Phase 15 (suite)

API (authentification, droits, un module à la fois) branchée sur Prisma, puis l'interface Next.js.
Chaque module métier de `packages/` s'y branche déjà par des interfaces (`Depot…`) à implémenter avec Prisma.
Point d'attention : le paiement d'une dépense et la délivrance pharmacie doivent s'exécuter **dans une seule transaction**.
