# Supabase backup — setup & restore runbook

Automated by `.github/workflows/supabase-backup.yml`. Design:
`docs/superpowers/specs/2026-08-05-offsite-backup-design.md`.

Runs daily at **19:00 UTC = 03:00 Kuala Lumpur (UTC+8)**: `pg_dump` of the
`public` schema → gpg AES-256 → private Backblaze B2 bucket.

## One-time setup (do this before the workflow can run)

### 1. Backblaze B2 bucket
1. Create a Backblaze account (no card required).
2. Create a **private** bucket, e.g. `finvaio-db-backups`.
3. **Enable Object Lock** on the bucket **at creation** (it cannot be added
   later). Set a default retention of **30 days**, Governance mode.
4. Add a **Lifecycle rule**: keep only the last **30 days** (hide + delete files
   older than 30 days). With Object Lock at 30 days, files become deletable
   exactly as the lock expires.
5. Create an **Application Key scoped to this one bucket** (readWrite). Copy the
   `keyID`, the `applicationKey` (shown once), the **S3 endpoint** (Bucket
   details → Endpoint, e.g. `s3.us-west-004.backblazeb2.com` → prefix
   `https://`), and the bucket name.

### 2. Supabase connection string
Supabase Dashboard → Connect → **Session pooler** (port 5432). Copy the URL; it
looks like
`postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
Do NOT use the direct host (IPv6-only) or the transaction pooler (6543).

### 3. GitHub repository secrets
GitHub → repo → Settings → Secrets and variables → Actions → New repository
secret:

| Secret | Value |
|--------|-------|
| `SUPABASE_DB_URL` | the Session-pooler URL from step 2 |
| `BACKUP_GPG_PASSPHRASE` | a strong passphrase — **also save it in your password manager**; if it's lost, every backup is permanently unreadable |
| `B2_S3_ENDPOINT` | `https://s3.<region>.backblazeb2.com` |
| `B2_KEY_ID` | B2 keyID |
| `B2_APP_KEY` | B2 applicationKey |
| `B2_BUCKET` | bucket name |

### 4. Activate
The workflow's `schedule` only fires from the **default branch (main)**. Merge
the workflow to `main`, then GitHub → Actions → "Supabase backup" → **Run
workflow** to smoke-test immediately (don't wait for 03:00). A green run + an
object under `daily/` in B2 = working.

## Restore drill (the ONLY real proof a backup works — run quarterly)

```bash
# 1. Download the latest encrypted dump from B2
aws s3 ls "s3://<bucket>/daily/" --endpoint-url https://s3.<region>.backblazeb2.com
aws s3 cp "s3://<bucket>/daily/finvaio-<stamp>.dump.gpg" . \
  --endpoint-url https://s3.<region>.backblazeb2.com

# 2. Decrypt
gpg --batch --yes --decrypt --passphrase '<BACKUP_GPG_PASSPHRASE>' \
    --output finvaio.dump finvaio-<stamp>.dump.gpg

# 3. Inspect the archive (no DB needed)
pg_restore --list finvaio.dump | head

# 4. Restore into a THROWAWAY target (never production)
createdb finvaio_restore
pg_restore --no-owner --no-privileges -d finvaio_restore finvaio.dump

# 5. Verify row counts match production
psql -d finvaio_restore -c "select
  (select count(*) from clients)            as clients,
  (select count(*) from portfolio_holdings) as portfolio,
  (select count(*) from insurance_policies) as insurance;"
# Expect clients ≈ 900, portfolio ≈ 1232, insurance ≈ 1081 (as of 2026-08-05).
```

## Notes
- The dump is `public` schema only — that is 100% of app data. System schemas
  (auth/storage/realtime/vault) are empty and intentionally excluded.
- To restore into a fresh Supabase project, use its Session-pooler URL as the
  `-d` target in step 4 instead of a local `finvaio_restore` DB.
- `pg_dump`/`pg_restore` must be version **≥ 18** (the Supabase server major).
