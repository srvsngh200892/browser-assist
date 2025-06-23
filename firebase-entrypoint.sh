#!/bin/bash
set -ex

BASE_EXPORT_DIR="/app/firebase-data/backups"

# Graceful shutdown
safe_shutdown() {
  TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
  CURRENT_EXPORT="$BASE_EXPORT_DIR/export-$TIMESTAMP"
  mkdir -p "$CURRENT_EXPORT"

  echo "🛑 Caught shutdown signal. Exporting to $CURRENT_EXPORT"
  if firebase emulators:export "$CURRENT_EXPORT" --project=demo-local; then
    echo "✅ Export complete."
  else
    echo "❌ Export failed"
    ls -la "$CURRENT_EXPORT"
  fi

  echo "♻️ Rotating backups (keeping last 5)..."
  ls -dt "$BASE_EXPORT_DIR"/export-* | tail -n +6 | xargs -r rm -rf
  echo "✅ Backup rotation complete."

  exit 0
}

trap safe_shutdown SIGINT SIGTERM

# Restore from latest backup (ignore the not-yet-created CURRENT_EXPORT)
LATEST_BACKUP=$(ls -dt "$BASE_EXPORT_DIR"/export-* 2>/dev/null | head -n 1)

echo "🧭 Will attempt to import from: $LATEST_BACKUP"
ls -l "$LATEST_BACKUP"

if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP/firebase-export-metadata.json" ]; then
  echo "📦 Importing from $LATEST_BACKUP"
  firebase emulators:start \
    --only firestore,storage,ui \
    --project demo-local \
    --import="$LATEST_BACKUP" &
else
  echo "⚠️ No valid backup found, starting fresh"
  firebase emulators:start \
    --only firestore,storage,ui \
    --project demo-local &
fi

wait
