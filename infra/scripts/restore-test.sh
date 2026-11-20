#!/usr/bin/env bash
# Test de restauration dans une base TEMPORAIRE (jamais sur la base de production). STATUT : syntaxe vérifiée, NON exécuté.
set -euo pipefail
fichier="${1:?usage: restore-test.sh <sauvegarde.dump.enc>}"; : "${BACKUP_PASSPHRASE_FILE:?}"; : "${ADMIN_DATABASE_URL:?}"
( cd "$(dirname "$fichier")" && sha256sum -c "$(basename "$fichier").sha256" )     # intégrité du fichier
base="ndiemane_restore_test_$$"
psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE $base"
trap 'psql "$ADMIN_DATABASE_URL" -c "DROP DATABASE IF EXISTS $base"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass file:"$BACKUP_PASSPHRASE_FILE" -in "$fichier" \
  | pg_restore --no-owner --dbname "${ADMIN_DATABASE_URL%/*}/$base"
for t in "Patient" "Consultation" "JournalAudit" "Utilisateur"; do
  n=$(psql "${ADMIN_DATABASE_URL%/*}/$base" -tAc "SELECT count(*) FROM \"$t\"")
  echo "Table $t : $n lignes"
done
echo "Restauration de test OK. Comparer ces comptages avec la production."
