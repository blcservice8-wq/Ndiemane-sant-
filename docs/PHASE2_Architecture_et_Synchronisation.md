# NDIEMANE SANTÉ DIGITAL - Phase 2 : Architecture et synchronisation

## 1. Structure du dépôt
```
ndiemane/
  apps/web/            Next.js + TypeScript (PWA, UI)
  apps/api/            API structurée (NestJS)
  packages/db/         schema.prisma, migrations, seed (rôles/permissions)
  packages/sync/       moteur de synchronisation
  infra/               docker-compose.local.yml, docker-compose.cloud.yml
  docs/
```

## 2. Déploiement hybride
- **Serveur local** (poste de santé) : API + PostgreSQL local. Les postes y accèdent par le réseau local. Source de vérité pendant une coupure.
- **Cloud** : API + PostgreSQL central. Accès distant, sauvegardes hors site.
- Les deux exécutent le même code et le même schéma (mêmes migrations).

## 3. Protocole de synchronisation
1. Toute écriture locale crée, dans la même transaction, une ligne `OperationSync` (outbox) : entité, id, opération, charge utile, `versionBase`, `cleIdempotence` (UUID).
2. Un worker envoie les opérations par lots au cloud (HTTPS, ordre chronologique). Reprise automatique après coupure.
3. Le cloud applique chaque opération une seule fois (`cleIdempotence` unique) : pas de doublons.
4. Le cloud renvoie ses changements depuis le dernier curseur (`updatedAt`, `version`), appliqués localement.
5. Chaque étape est tracée (`statut`, `tentatives`, `erreur`).

## 4. Règles de conflit (même enregistrement modifié des deux côtés)
| Donnée | Règle |
|---|---|
| Stock | Jamais synchronisé comme valeur : recalculé depuis `MouvementStock` (additif, sans conflit) |
| Données cliniques (consultation, résultat) | Conflit -> `ConflitSync`, résolution manuelle par un responsable habilité |
| Fiches simples (personnel, fournisseur, équipement) | Version la plus récente gagne, ancienne valeur gardée dans l'audit |
| Finances validées | Immuables ; correction par écriture inverse |
| Création de patient | Détection de doublon par `empreinteDoublon`, fusion proposée, jamais automatique |

## 5. Sécurité des données locales
- PostgreSQL local : disque chiffré, accès réseau limité au sous-réseau du poste.
- Navigateur : aucun dossier médical en clair dans localStorage/IndexedDB ; le service worker ne met en cache que l'interface.
- Sauvegardes chiffrées quotidiennes, copie cloud, test de restauration avant production.

## 6. Règles de base de données
- UUID générés côté client ; `siteId` partout (multi-postes) ; `version` incrémentée à chaque mise à jour.
- Suppression : `onDelete: Restrict` par défaut, `deletedAt` pour l'archivage ; `Cascade` seulement pour lignes dépendantes sans valeur propre (lignes de commande, présences, permissions).
- Index sur les recherches fréquentes : nom patient, dates, péremptions, statuts.
- À ajouter en migration SQL : contraintes CHECK (quantités, montants >= 0), trigger anti-modification sur `JournalAudit`, stock lot >= 0.

## 7. Prochaine étape - Phase 3
Initialisation du dépôt, Docker, authentification (mots de passe hachés, MFA, verrouillage), RBAC branché sur `Role`/`Permission`, journal d'audit, seed des 12 profils.
