# Backup & Restore

**How to get the Foundation's records back.**

| | |
|---|---|
| Status | Billing lock resolved 2026-08-15 (§0a); CI and the self-test now run. Procedure documented; dump/restore drilled 2026-08-15 on development (§8). **Production drill still outstanding**; the `age` round trip is proved in CI (§8a) |
| Applies to | Production |
| Companion to | `runbook.md`, `compliance/breach-response.md` |

> **The point.** This system holds fifty people's financial records and their
> identity numbers. "Neon does backups" is not a backup strategy — it is an
> assumption about someone else's product that nobody here has tested. This
> document exists so that the first time a restore is attempted is **not** the day
> it is needed.

---

## 0a. The billing lock — found, and resolved 2026-08-15

For most of this repository's life, **no GitHub Actions run ever reached a job**:
2 254 runs, every one `startup_failure`, going back to at least 29 May. The
cause was invisible to the REST API and written only in a banner in the web UI:

> GitHub Actions workflows can't be executed on this repository. Your account's
> billing is currently locked. Please update your payment information.

Underneath it, on the billing page: *"Invalid payment method — authorization hold
failed."* Nothing was owed — GitHub Free and Copilot Free are both $0.00/month
and metered usage was $0. The billing address on file was **empty**, so the
bank's address check declined the verification hold, and GitHub locked billing
across the account. On a private repository that lock blocks Actions outright.

**Resolved** by completing the billing address and re-running the authorisation.

### Verified working, same day

| | |
|---|---|
| **Backup Self-Test** | ✅ **Passed in 19s** — the first successful workflow run in this repository's history. Round trip byte-identical, wrong key refused, truncated archive refused |
| **Backup** | ✅ Guard verified: refused at the first step because `BACKUP_AGE_PUBLIC_KEY` is unset, rather than producing an unencrypted dump. Correct behaviour, now demonstrated rather than assumed |

### What it cost while it lasted

- **The daily backup never executed once.** There is still no encrypted copy of
  anything — that waits on §3b below.
- **CI never validated a single commit** in this repository's history, up to this
  point. Every gate ever reported on every pull request was run on a developer
  machine.

### What CI found once it could run

CI went green on 2026-08-15 (PR #388). Getting there took five failures, and
every one of them was a real defect that had been sitting undetected for as long
as Actions had been blocked:

| | |
|---|---|
| `nanoid <3.3.18` | A live high-severity advisory. The security-advisories step exists for exactly this and had never executed |
| Seeding on Node 20 | `--import tsx/esm` throws `ERR_REQUIRE_CYCLE_MODULE`. Development runs Node 24; `engines` claims `>=20` |
| Turborepo strict env | `turbo.json` declared nothing, so every **cached** task ran with a filtered environment. `cache: false` tasks got the full one, which is why seeding worked and hid it |
| Nine missing variables | `NEXTAUTH_URL`, `WEB_INTERNAL_URL`, `ADMIN_API_SECRET` and the six `NEXT_PUBLIC_*` the website build requires |
| `next/font/google` | Fetches at build time; the runners could not reach it, twice. The font is now self-hosted in `packages/ui/fonts` |

The point worth keeping: none of these were introduced by the work that finally
ran them. They were all already true, and the only thing standing between the
repository and knowing about them was a declined card.

### The reasoning failure, kept on purpose

Two rounds of API investigation reached the wrong answer, and the second was
published with more confidence than it had earned.

The first guess was exhausted Actions minutes. Checking usage looked like a
refutation — no Actions usage in June, July or August, zero billable time on
every run, free allowance untouched — and that was written up as *"it is not the
billing."*

**That evidence was a symptom of the real cause.** A billing lock stops runs
before they start, and runs that never start consume nothing, so zero usage is
precisely what a lock produces. Zero usage ruled out *exhaustion*; it never ruled
out *billing*. The two were treated as one thing.

Every API surface reported health: Actions enabled, all actions allowed,
workflows registered and `active`, permissions normal, a manual dispatch failing
as fast as a push. **When every API says healthy and nothing works, open the page
in a browser — earlier than it feels necessary.**

### Still to do

1. Set `BACKUP_AGE_PUBLIC_KEY` and `PRODUCTION_DIRECT_DATABASE_URL` (§3b), after
   which the daily backup runs for real and the first encrypted copy exists.
2. The production drill (§8).
3. Minor: `actions/checkout@v4` targets Node 20, which is deprecated and now
   forced onto Node 24. Move to `@v5` before it stops being forced.

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

**What is now tested:** the dump, the archive's readability, and the restore, end
to end on development — which found that the audit log was not append-only and
that two of the verification checks were wrong. See §8.

**Since updated — see §8b.** The `age` round trip has now been run against a real dump. What remains untested is all of it
against *production* data. Neither has been done, and until the production drill
is run the recovery time is unknown.

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
| 4 | **Ledger preserved** | Entry count and pool balance match the source. **Not** "debits equal credits" — see below |
| 5 | **Encrypted columns decrypt** | `npm run secrets:reencrypt -w @xxm/database` — read-only without `--apply`. It walks every encrypted column and names the rows it cannot read. If any are named, the key ring is wrong and the restore is worthless |
| 6 | Login works | Sign in as a test member |
| 7 | Mandates intact | One active mandate per member still holds; no duplicates |
| 8 | Audit log append-only | Confirm the constraint survived |

**Record the result and the date.** An unverified restore capability is an
assumption.

### The queries, and why check 4 was wrong

Run these against the restored database and compare with the source.

```sql
-- 1. Row counts
SELECT 'users', count(*) FROM users
UNION ALL SELECT 'contributions',  count(*) FROM contributions
UNION ALL SELECT 'transactions',   count(*) FROM transactions
UNION ALL SELECT 'ledger_entries', count(*) FROM ledger_entries
UNION ALL SELECT 'audit_logs',     count(*) FROM audit_logs;

-- 2. Latest data present
SELECT max("createdAt") FROM audit_logs;

-- 4. Ledger preserved. Compare all three numbers with the source.
SELECT count(*) AS entries,
       coalesce(sum(amount) FILTER (WHERE direction = 'CREDIT'), 0) AS credits,
       coalesce(sum(amount) FILTER (WHERE direction = 'DEBIT'),  0) AS debits
FROM ledger_entries;

-- 7. No member holds two active mandates
SELECT coalesce(max(n), 0) FROM (
  SELECT count(*) n FROM payment_mandates WHERE status = 'ACTIVE' GROUP BY "userId"
) x;   -- must be 0 or 1

-- 8. The append-only guarantee is present
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal;
-- expect audit_logs_no_update and audit_logs_no_delete
```

**Check 4 used to read "debits equal credits", and that was wrong.** This ledger
is not two-legged per entry. A `GOAL_PAYMENT` writes a **CREDIT** when money
arrives and a **DEBIT** only if the bank later reverses it — see
`apps/web/services/goal-payment.service.ts`. Debits equalling credits would
therefore mean every payment ever made had been reversed, which is an empty
fund, not a healthy one. The 2026-08-15 drill hit this immediately: a perfectly
good database showed 4 230 in credits against 4 100 in debits and "failed" a
check it could only ever have passed while broke.

What matters on a restore is that the ledger came back **unchanged**, which is
what the query above tests.

---

## 8. Drill

### Partially executed — 2026-08-15, against development

A dump-and-restore drill was run end to end on the development database. It is
**not** the go-live drill: it did not use production data, and the `age`
encrypt/decrypt round trip was not exercised because `age` is not installed on
the machine it ran from. Everything either side of that step was.

| Step | Result |
|---|---|
| `pg_dump --format=custom` | 143 KB, 40 table-data entries |
| `pg_restore --list` | Readable archive |
| Full read-back (`pg_restore --file=...`) | 151 KB of SQL, no error |
| `pg_restore --no-owner --clean --if-exists` | Exit 0, no errors |
| Check 1 — row counts | **Identical**, source vs restored |
| Check 2 — latest audit entry | Preserved to the second |
| Check 3 — `prisma migrate status` | Up to date, 44 migrations |
| Check 4 — ledger preserved | Passes, once the check itself was corrected — see §7 |
| Check 7 — one active mandate per member | Passes |
| Check 8 — audit log append-only | **Failed. There was no constraint at all** |

**What the drill found, and what was done about it**

1. **The audit log was not append-only.** An `UPDATE` and a `DELETE` against
   `audit_logs` as the ordinary application role both succeeded — one row
   rewritten, another removed. No trigger, no rule, no row-level security.
   Migration `20260815090000_audit_log_append_only` now enforces it in the
   database; both statements are refused and `INSERT` is untouched.
2. **Check 4 could never pass on a healthy database.** Corrected in §7.
3. **Check 8 had nothing to confirm.** It does now, and §7 gives the query.
4. **`pg_restore --file=/dev/null` fails on Windows** — there is no `/dev/null`
   for the Windows build, so the full read-back reports "could not open output
   file". This is not a fault in `backup.yml`, which runs on `ubuntu-latest`
   where the path is valid. Drilling from a Windows machine, write to a real
   temporary file instead and delete it afterwards.
5. **The application's database role cannot create a database.** `xxm` has
   neither `CREATEDB` nor superuser, so "restore into a fresh database" cannot
   be done with the app's own credentials. On Neon this is a console operation
   (branch or new database); locally it needs the `postgres` role. Worth knowing
   before the clock is running.

### 8-prod. The real drill — 2026-09-04, production data, the real key

The first drill against **production data**, with the **real private key**,
and the first successful backup this repository has ever produced. Everything
§8 owed.

| Step | Result |
|---|---|
| Nightly backup run | 182,716 byte dump of `staging`, encrypted, retained 90 days |
| Download artifact | 182,948 bytes |
| `age -d -i <private key>` | **Decrypts.** 182,716 bytes, header `PGDMP` |
| Restore into a scratch Neon branch (CI) | Exit 0 |
| Tables, source vs restored | **40 = 40** |
| Rows, source vs restored | **623 = 623** |

The restore-and-compare half now runs monthly and on demand as
`.github/workflows/restore-drill.yml`, against a scratch branch it creates from
the empty default branch and deletes afterwards. A drill that depends on
somebody's laptop is not a drill; it is a thing that happened once.

The decrypt half cannot be automated and should not be: the private key is held
offline by two office bearers and never reaches GitHub, which is the property
that makes storing backups on a public repository defensible at all. Opening a
real artifact with the real key stays a human step, and is the step to repeat
whenever custody of the key changes.

### 8-prod-a. ⚠️ The machine doing the restore needs a client new enough to read it

Found during that drill, and it is the kind of problem that only appears when
the clock is running.

`backup.yml` dumps with PostgreSQL **18**, so the archive is format version
**1.16**. The office machine had PostgreSQL **16.14**, and:

```
pg_restore: error: unsupported version (1.16) in file header
```

The backup was perfect. The tooling on the machine holding the key could not
open it. Nothing about that is visible until the day it matters, and on that day
the answer is "install a database server first", under pressure, probably at
night.

**Before an emergency, make sure one of these is true on the machine that holds
the private key:**

| Option | Command |
|---|---|
| Docker (lightest — no server installed) | `docker run --rm -v "$PWD:/b" -w /b postgres:18 pg_restore --list restored.dump` |
| PostgreSQL 18 client | `winget install PostgreSQL.PostgreSQL.18` |

Docker is the better answer for a machine that is not a database host: it needs
no service running, the image version can match whatever `backup.yml` used on
the night, and a future move to PostgreSQL 19 is a tag change rather than
another install. It is the only reason this project needs Docker at all — CI
provides its own client and Vercel builds without one — but "the only reason" is
still a sufficient one when the reason is reading your own backup.

**Check the archive version against your client before you need to:**

```bash
# what wrote it
pg_restore --list restored.dump | head -1
# what you have
pg_restore --version
```

### 8a. The `age` round trip — proved in CI

`.github/workflows/backup-selftest.yml` runs the whole crypto path on a
throwaway keypair and synthetic data: keygen, encrypt, decrypt, compare
byte-for-byte. It also asserts the two things that would quietly void every
backup — that a *wrong* key is refused, and that a **truncated** archive is
refused rather than restored as a partial file.

It needs no secrets, touches no database, and never sees a member's information.
It runs on every change to either backup workflow, and monthly, because the
runner image changes even when the crypto does not.

Why it exists: `backup.yml` encrypts to a public key whose private half is
deliberately kept out of GitHub, which means **nothing in CI had ever decrypted
anything**. The scheduled job could have been writing unreadable files since the
day it was written and every run would have reported success. Encrypting is the
part it does; reading back is the part nobody does until the database is gone.

This is not the production drill. It proves the envelope can be opened, not that
what is inside it is a restorable database — §8 still owes that.

### 8b. Development drill, 2026-08-16 — the full pipeline, end to end

Run against the development database with `age` installed locally and a throwaway
keypair. Every step of §6b exercised, and the restore done **inside a transaction
that was rolled back**, so nothing was written.

| Step | Result |
|---|---|
| `pg_dump --format=custom` | 144 KB, 40 table-data entries |
| `pg_restore --list` | Opens cleanly |
| Full archive read to SQL | 153 KB — every block decompressed |
| `age` encrypt | 145 KB, ciphertext differs from plaintext |
| Wrong key | **Refused** |
| `age` decrypt → sha256 | **Byte-identical** to the original dump |
| Restore into a live server | All 40 tables, inside `BEGIN … ROLLBACK` |
| Row counts vs original | users 3/3, contributions 3/3, transactions 6/6, ledger 18/18, audit_logs 89/89, mandates 2/2, templates 43/43 — **all match** |
| Append-only triggers | Both `audit_logs_no_delete` and `audit_logs_no_update` restored |
| Dev database afterwards | Untouched — one schema, 40 tables, same row counts |

**Method worth reusing.** The application role cannot `CREATE DATABASE`, which is
what stopped the previous drill from restoring anywhere. It *can* create schemas,
so the restore was done as `BEGIN; ALTER SCHEMA public RENAME TO drill_orig;
CREATE SCHEMA public; \i dump.sql; …verify…; ROLLBACK;`. That exercises real DDL
and real inserts against a real server, lets the restored tables be compared
directly against the originals in the same transaction, and leaves nothing
behind — including if it crashes, since Postgres rolls back an open transaction
on disconnect.

**What it found.** One bank account row written under a key no longer in the ring
(`unversioned`, from 2026-06-11), unreadable and undetected until something asked
for it. Development data, and harmless there — but the same condition in
production is a member whose mandate cannot be submitted, discovered on debit
night. It also exposed that `secrets:reencrypt` did not cover
`Invitation.idNumber`, so a rotation would have reported a clean sweep while
leaving every invitation pinned to the retired key. Both are covered now.

**Windows note.** This `pg_dump`/`psql` build does not permute options after the
connection string — `pg_dump "$URL" --format=custom` is silently rejected as
"too many command-line arguments". Pass `-d "$URL"` last instead. GNU getopt
permutes, so `backup.yml` on ubuntu-latest is unaffected.

### Still outstanding — the real drill, before go-live

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
