#!/bin/bash
# scripts/backup-supabase.sh
# ---------------------------------------------------------------------------
# Daily pg_dump of the Supabase Postgres DB (Phase 2 §7 backup — free tier has
# no PITR / daily backups, and the migrated code hard-DELETEs, so this is the
# only safety net before/after cutover).
#
# Reads the PG* connection vars from .env.local (never hard-codes secrets),
# writes a compressed custom-format dump to $BACKUP_DIR, and prunes to the most
# recent $KEEP dumps. Meant to run via launchd (see io.finva.supabase-backup.plist)
# but is safe to run by hand:  bash scripts/backup-supabase.sh
#
# Restore examples (custom format):
#   pg_restore --list finvaio-YYYYMMDD-HHMMSS.dump        # inspect
#   pg_restore --no-owner --no-privileges -d "<target>" finvaio-....dump
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="/Applications/XAMPP/xamppfiles/htdocs/finvaio（atancw88）"
ENV_FILE="${SUPABASE_ENV_FILE:-$REPO_DIR/.env.local}"
BACKUP_DIR="${SUPABASE_BACKUP_DIR:-$HOME/finvaio-backups}"
KEEP="${SUPABASE_BACKUP_KEEP:-14}"

# Locate a pg_dump >= server major (17). Prefer an explicit override, then libpq /
# postgresql kegs, then PATH.
find_pgdump() {
  if [[ -n "${PGDUMP_BIN:-}" && -x "${PGDUMP_BIN:-}" ]]; then echo "$PGDUMP_BIN"; return; fi
  for c in \
    /opt/homebrew/opt/libpq/bin/pg_dump \
    /usr/local/opt/libpq/bin/pg_dump \
    /opt/homebrew/opt/postgresql@17/bin/pg_dump \
    /usr/local/opt/postgresql@17/bin/pg_dump \
    "$(command -v pg_dump 2>/dev/null || true)"; do
    [[ -n "$c" && -x "$c" ]] && { echo "$c"; return; }
  done
  return 1
}

# Read a single KEY=value from the env file: tolerate '=' in the value and strip
# surrounding single/double quotes. Does NOT source the file (avoids executing it).
load() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//"; }

mkdir -p "$BACKUP_DIR"
LOG="$BACKUP_DIR/backup.log"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

PGDUMP="$(find_pgdump)" || { log "FAILED: no pg_dump found (install: brew install libpq)"; exit 127; }

export PGHOST="$(load PGHOST)"
export PGPORT="$(load PGPORT)"
export PGUSER="$(load PGUSER)"
export PGPASSWORD="$(load PGPASSWORD)"
export PGDATABASE="$(load PGDATABASE)"
export PGSSLMODE="${PGSSLMODE:-require}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-30}"

if [[ -z "$PGHOST" || -z "$PGPASSWORD" ]]; then
  log "FAILED: PGHOST/PGPASSWORD not found in $ENV_FILE"; exit 78
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/finvaio-$STAMP.dump"

log "starting pg_dump ($("$PGDUMP" --version)) host=$PGHOST db=$PGDATABASE → $OUT"
if "$PGDUMP" --no-owner --no-privileges --format=custom --compress=9 --file="$OUT.tmp" 2>>"$LOG"; then
  mv "$OUT.tmp" "$OUT"
  log "OK $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
else
  rc=$?; rm -f "$OUT.tmp"; log "FAILED pg_dump rc=$rc"; exit "$rc"
fi

# Prune: keep the newest $KEEP dumps (bash 3.2 compatible — macOS /bin/bash)
ls -1t "$BACKUP_DIR"/finvaio-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while IFS= read -r f; do
  [[ -n "$f" ]] && { rm -f "$f"; log "pruned $(basename "$f")"; }
done

log "done — $(ls -1 "$BACKUP_DIR"/finvaio-*.dump 2>/dev/null | wc -l | tr -d ' ') dump(s) retained"
