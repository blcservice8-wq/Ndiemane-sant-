# Procédure de sauvegarde et de restauration

> **Statut honnête** : la logique de sauvegarde (chiffrement, vérification d'intégrité, rétention) est testée (`packages/securite`, 18 tests). Les scripts `infra/scripts/*.sh` ont seulement leur syntaxe vérifiée : ils n'ont **jamais été exécutés contre une vraie base**. Aucune donnée réelle ne doit être saisie avant d'avoir réussi un test de restauration (section 4).

## 1. Règles
- Une sauvegarde par jour, chiffrée (AES-256), avec empreinte SHA-256.
- Au moins une copie **hors du poste de santé** (serveur cloud ou support externe), au moins une copie hors ligne.
- La clé de chiffrement est conservée **séparément** des sauvegardes (responsable du poste + une personne de confiance). Sans elle, aucune restauration n'est possible.
- Conservation recommandée : 7 quotidiennes, 4 hebdomadaires, 12 mensuelles (paramétrable).

## 2. Sauvegarde automatique
1. Renseigner `infra/.env` (`BACKUP_DIR`, `BACKUP_PASSPHRASE_FILE`, `BACKUP_REMOTE`).
2. Programmer `infra/scripts/backup.sh` chaque nuit (cron, 02:00).
3. Vérifier chaque semaine que la dernière sauvegarde existe, que son `.sha256` est présent et que sa taille est cohérente.

## 3. Restauration d'urgence (panne ou perte)
1. Ne **jamais** restaurer par-dessus la base en place sans copie de l'état actuel.
2. Installer un serveur propre (guide de déploiement), arrêter l'API.
3. Vérifier l'empreinte : `sha256sum -c fichier.sha256`.
4. Déchiffrer et restaurer : `openssl enc -d ... | pg_restore --clean --no-owner --dbname ...`.
5. Redémarrer l'API, vérifier : connexion, nombre de patients, dernière écriture de la caisse, intégrité du journal d'audit.
6. Rejouer la synchronisation : les opérations locales non envoyées sont conservées dans la file d'envoi.
7. Consigner l'incident (date, cause, perte de données éventuelle).

## 4. Test de restauration (obligatoire, trimestriel)
1. `restore-test.sh` sur la sauvegarde la plus récente (base temporaire).
2. Comparer les comptages avec la production.
3. Consigner la date, la personne, le résultat. **Une sauvegarde jamais restaurée n'est pas une sauvegarde.**
