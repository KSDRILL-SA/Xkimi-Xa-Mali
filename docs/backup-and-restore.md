# Backup & Restore

**How to get the Foundation's records back.**

| | |
|---|---|
| Status | Procedure documented; **not yet exercised** — see §7 |
| Applies to | Production |
| Companion to | `runbook.md`, `compliance/breach-response.md` |

> **The point.** This system holds fifty people's financial records and their
> identity numbers. "Neon does backups" is not a backup strategy — it is an
> assumption about someone else's product that nobody here has tested. This
> document exists so that the first time a restore is attempted is **not** the day
> it is needed.

---

## 0. Where we actually stand — the 3-2-1 rule

The rule: **3** copies of the data, on **2** different platforms, **1** of them
off-site. Measured honestly:

| | Before (2026-08-14) | Now |
|---|---|---|
| **3 copies** | ❌ One — whatever Neon held | ⚠️ Two — Neon PITR + daily encrypted dump. **Third is the monthly offline copy, §3c, and it is manual** |
| **2 platforms** | ❌ One — Neon only | ✅ Neon + GitHub, independent accounts and vendors |
| **1 off-site** | ❌ None | ✅ The encrypted dump is off Neon entirely |

**What changed:** `.github/workflows/backup.yml` now dumps the production database
daily, encrypts it, and retains it for 90 days — on a platform with no
relationship to the database host.

**What is still on a human:** the third copy. GitHub's 90-day artifact retention
is a rolling operational window, not an archive, and the Foundation's accounting
retention obligations run to years. **Once a month, download that day's artifact
and keep it offline** (§3c). Until someone does that, there is no copy that
survives losing both vendor accounts.

**What is still untested:** all of it. See §8.

---

## 1. What has to survive

Four things, and they are not in the same place. A backup of any three is not a
backup.

| # | Asset | Where | Loss means |
|---|---|---|---|
| 1 | **Postgres database** | Neon | Everything — members, contributions, ledger, audit log |
| 2 | **Encryption key ring** | Environment variable | **See §2. This is the one that ends the Foundation.** |
| 3 | **Backup private key** | Password manager, two holders | Every encrypted backup becomes unreadable (§3a) |
| 4 | **Blob storage** | Vercel Blob | PDF statements, signature images |
| 5 | **Environment configuration** | Vercel + password manager | Ability to run at all |

Items 2 and 3 are different keys with the same property: **there is no recovery
path if they are lost.** Both live in the same two password managers, and both
should be checked whenever an office bearer changes.

---

## 2. The key ring — read this before anything else

ID numbers and bank account numbers are stored **encrypted**. The key ring lives
in an environment variable.

**If the key ring is lost, those columns are permanently unreadable. No part of
the application can recover them.** A complete, uncorrupted, perfectly restored
database is *still* a database in which no member's ID number or bank account can
ever be read again — which means no mandate can be submitted, and the Foundation
cannot collect.

Therefore:

- The key ring is backed up **separately from the database**, in a password
  manager, held by **at least two** office bearers.
- It is **never** committed, never in a chat message, never in an email.
- Retired keys are **retained**, not deleted. Data encrypted under an old key
  stays readable only while that key exists in the ring. Rotation adds; it does
  not replace.
- A database backup taken before a rotation must be restorable with the key ring
  **as it was at that time** — which is why old keys are kept.

**Test for this specifically.** A restore drill that only checks row counts will
pass while every encrypted column is unreadable. See §7 step 5.

---

## 3. Database — Neon

### What Neon gives you

- **Point-in-time restore** within the history retention window of the current
  plan.
- **Branching** — a restore can be taken as a new branch without touching
  production.

**Confirm the retention window on the current plan and write it here: `[N DAYS]`.**
This number is the entire recovery guarantee, and it differs by plan. A defect
discovered on day 8 with a 7-day window is unrecoverable.

### 3a. The automated daily dump — `.github/workflows/backup.yml`

Runs at 01:30 UTC (03:30 SAST) daily, and on demand.

| | |
|---|---|
| Dumps | Production, via the **unpooled** connection string |
| Encrypts | With `age`, to a **public** key |
| Retains | 90 days, as a GitHub Actions artifact |
| Fails loudly if | The key is missing, the dump fails, or the dump is implausibly small |

**Why asymmetric encryption.** The public key sits in the workflow in plain sight.
The **private key never touches GitHub.** GitHub therefore runs the backup and
stores the backup but cannot read it. Had the workflow used a passphrase held in
GitHub Secrets, whoever held the repository would hold both the ciphertext and
the key, and the encryption would be decoration.

⚠️ **The trade:** lose the private key and every backup is permanently
unreadable. It needs the same care as the encryption key ring (§2).

The workflow refuses to run at all if the public key is absent, rather than
producing an unencrypted dump of fifty people's ID numbers and bank details.

### 3b. Setting it up — one time

```bash
# 1. Generate the keypair. Do this on a trusted machine, NOT in CI.
age-keygen -o xxm-backup-key.txt

# Output looks like:
#   Public key: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
```

Then:

| Step | Where |
|---|---|
| 1. Copy the **public** key into repository **Variables** as `BACKUP_AGE_PUBLIC_KEY` | GitHub → Settings → Secrets and variables → Actions → Variables |
| 2. Put the production **unpooled** connection string into **Secrets** as `PRODUCTION_DIRECT_DATABASE_URL` | Same page, Secrets tab |
| 3. Store `xxm-backup-key.txt` (the **private** key) in the password managers of **two** office bearers | Not GitHub. Not the repository. Not email |
| 4. Delete the private key from the machine that generated it | `shred -u xxm-backup-key.txt` |
| 5. Run the workflow by hand once and confirm it succeeds | Actions → Backup → Run workflow |
| 6. Do a restore drill (§8) | — |

### 3b-ii. The dead-man's switch — one time, and it matters

The workflow alerts loudly when a backup run **fails**. It cannot alert when a
run never happens, because the alert is a job inside the same workflow: nothing
scheduled means nothing runs, which means nothing speaks.

That is not a theoretical hole. **GitHub disables scheduled workflows after
roughly 60 days without repository activity.** The moment this system is finished
enough to stop being committed to every week is the moment its backups quietly
stop — and the last thing anyone heard was a success.

So the check lives in the app instead, which keeps its own schedule whatever
GitHub does to its. `apps/web/inngest/functions/backup-watch.ts` runs daily at
08:00 SAST and asks GitHub one question: when did `backup.yml` last complete
successfully? Older than 50 hours, or never, and it raises a **critical** alert.

| Step | Where |
|---|---|
| 1. Create a **fine-grained personal access token**, scoped to this repository only, with **Actions: read-only** and nothing else | GitHub → Settings → Developer settings → Personal access tokens |
| 2. Set `BACKUP_WATCH_TOKEN` to that token | The app's environment (Vercel → Settings → Environment Variables) |
| 3. Set `BACKUP_REPO` to `owner/repo` | Same place |

Both are **optional**. Without them the watcher does not fail the boot and does
not go quiet either — it reports `BACKUP_WATCH_BLIND` at `warning`, worded so it
cannot be mistaken for "the backup has stopped". That distinction is deliberate:
not being able to see the backup and the backup having stopped need different
first moves, and only one of them is urgent tonight.

The token is read-only and cannot reach the backup contents, which are encrypted
to a key GitHub does not hold. It confirms that a run happened — never that the
dump inside it is good. Only the restore drill (§8) can tell you that.

### 3c. The third copy — monthly, manual

GitHub keeps artifacts for 90 days. Accounting retention runs to years.

**Once a month:** download that day's artifact and store it offline — an
encrypted external drive, or a separate cloud account with no connection to
either Neon or GitHub. Record that you did it.

| | |
|---|---|
| Responsible | `[NAME]` |
| Kept | `[N]` monthly copies, then `[N]` annual |

⚠️ **The dump contains members' personal information**, even encrypted. It is
subject to POPIA exactly as the live database is. Do not put it anywhere the
Foundation would not put the database itself.

---

## 4. Blob storage

Vercel Blob holds generated PDF statements and signature images.

- Statements are **regenerable** from the database. Losing them is an
  inconvenience, not a loss of record.
- **Signature images are not regenerable.** They are evidence.

**Action:** confirm whether admin signature images are the only unrecoverable blob
content, and if so, include them in the off-platform backup.

---

## 5. Configuration

| Item | Where | Backed up |
|---|---|---|
| Encryption key ring | Password manager, two holders | §2 |
| Netcash service key and webhook secret | Password manager | `[CONFIRM]` |
| Database connection strings | Vercel + password manager | `[CONFIRM]` |
| Upstash, Blob, Sentry, Inngest credentials | Vercel + password manager | `[CONFIRM]` |
| `.env.example` | The repository | ✅ In git |

Production secrets are **not** the staging secrets. Both sets need to exist
somewhere a second person can reach them.

---

## 6. Restore procedure

### 6a. Recent, and production is the problem — point-in-time

1. In Neon, create a **branch** from the timestamp before the damage.
2. Verify against that branch — do **not** point production at it yet.
3. Run §7 verification.
4. Repoint `DATABASE_URL` to the restored branch; redeploy.
5. Run `prisma migrate deploy` if the schema is behind.

### 6b. From an encrypted dump

You need the **private key** from a password manager. Without it this step is
impossible — there is no recovery path, by design.

```bash
# 1. Retrieve the artifact (GitHub → Actions → Backup → the run → Artifacts)
#    and unzip it, giving xxm-<STAMP>.dump.age

# 2. Decrypt. Do this on a trusted machine.
age --decrypt --identity xxm-backup-key.txt \
    --output xxm-restore.dump xxm-<STAMP>.dump.age

# 3. Restore into an empty target
pg_restore --dbname="$DIRECT_DATABASE_URL" --no-owner --clean --if-exists xxm-restore.dump

# 4. Bring the schema forward
npx prisma migrate deploy

# 5. Destroy the plaintext when finished
shred -u xxm-restore.dump
```

Then §7. **Step 5 of §7 is the one that matters** — a restored database whose
encrypted columns will not decrypt is not a restored database.

### 6c. Total loss of the Neon account

1. Stand up Postgres elsewhere.
2. Restore the most recent off-platform dump (§3).
3. `prisma migrate deploy`.
4. **Restore the key ring from the password manager** — including retired keys.
5. Repoint and redeploy.
6. §7.

---

## 7. Verification — a restore is not done until this passes

Run every step. Steps 4 and 5 are the ones that actually matter.

| # | Check | How |
|---|---|---|
| 1 | Row counts plausible | Members, contributions, transactions, ledger entries |
| 2 | Latest data present | Most recent `AuditLog` entry is close to the restore point |
| 3 | Migrations current | `prisma migrate status` reports no pending |
| 4 | **Ledger balances** | Debits equal credits. A restore that breaks the ledger is a corrupted restore |
| 5 | **Encrypted columns decrypt** | Read one member's ID number and one bank account number **through the application**. If these fail, the key ring is wrong and the restore is worthless |
| 6 | Login works | Sign in as a test member |
| 7 | Mandates intact | One active mandate per member still holds; no duplicates |
| 8 | Audit log append-only | Confirm the constraint survived |

**Record the result and the date.** An unverified restore capability is an
assumption.

---

## 8. Drill — outstanding

**This procedure has never been executed.** Until it has, the Foundation does not
have a backup capability; it has a document about one.

### Before go-live

1. Take a dump of staging.
2. Restore it into a fresh database.
3. Run every check in §7 — **especially 4 and 5**.
4. Record how long it took.
5. Write the actual elapsed time here as the recovery time: `[RTO: ___]`.

### Then, annually

Repeat, and at the annual general meeting report that it was done. Members are
entitled to know their records can be recovered.

---

## 9. Objectives — to be set

| | Target | Rationale |
|---|---|---|
| **RPO** — acceptable data loss | `[___]` | Neon's window sets the floor; the ledger argues for less |
| **RTO** — acceptable downtime | `[___]` | Measure it in the drill before committing |

Set these before go-live. An objective chosen after an incident is a
rationalisation.

---

## 10. Owner

| Role | Name |
|---|---|
| Responsible for backups running | `[NAME]` |
| Holds the key ring (primary) | `[NAME]` |
| Holds the key ring (second) | `[NAME]` |
| Runs the annual drill | `[NAME]` |
