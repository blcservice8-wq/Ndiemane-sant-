#!/usr/bin/env bash
# Sauvegarde chiffrée quotidienne. STATUT : syntaxe vérifiée, NON exécuté contre une vraie base (à tester avant production).
set -euo pipefail
: "${DATABASE_URL:?}"; : "${BACKUP_DIR:?}"; : "${BACKUP_PASSPHRASE_FILE:?}"
horodatage="$(date -u +%Y%m%dT%H%M%SZ)"
fichier="$BACKUP_DIR/ndiemane-$horodatage.dump.enc"
mkdir -p "$BACKUP_DIR"; umask 077
trap 'rm -f "$fichier.tmp"' EXIT
pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass file:"$BACKUP_PASSPHRASE_FILE" > "$fichier.tmp"
[ -s "$fichier.tmp" ] || { echo "ERREUR : sauvegarde vide" >&2; exit 1; }
mv "$fichier.tmp" "$fichier"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$fichier")" > "$(basename "$fichier").sha256" )
if [ -n "${BACKUP_REMOTE:-}" ]; then rclone copy "$fichier" "$fichier.sha256" "$BACKUP_REMOTE"; fi
# Rétention simple : 30 jours en local (la rétention fine quotidienne/hebdo/mensuelle est spécifiée dans packages/securite)
find "$BACKUP_DIR" -name 'ndiemane-*.enc*' -mtime +30 -delete
echo "Sauvegarde OK : $fichier"
