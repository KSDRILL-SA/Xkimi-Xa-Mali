# What's Done, and What's Left

The single page to read when picking this project back up.

Where the system actually stands, what only a human can finish, and the order to
do it in. Written 2026-07-27, with `Dev` at `39440c4`.

---

## The short version

**The code is finished.** Three apps build, 782 tests pass, 28 migrations apply
without drift, and the security audit is closed.

**Nothing is deployed.** Not one account exists — no domain, no database, no
payment gateway. Every remaining task needs a human with a credit card and an
identity document, which is why none of it could be done for you.

**The gap between those two facts is roughly two days of setup, plus however
long Netcash takes.**

| | |
|---|---|
| Where deployment **starts** | Registering a domain and beginning Netcash DebiCheck onboarding |
| Where deployment **ends** | The four founders using the live system for one full debit cycle |
| The long pole | **Netcash onboarding — weeks.** Everything else is days |
| Biggest risk | The money path has never touched a real gateway |

---

## 1. What exists

| | |
|---|---|
| Apps | 3 — member portal, admin console, marketing site |
| Database | 35 models, 28 migrations, no drift |
| API routes | 77 |
| Scheduled jobs | 16, including the debit run and nightly reconciliation |
| Tests | 782 across 5 suites |
| Builds | web 75 routes, admin 19, website 8 — all green |

Verified by running it, not by reading it: migrations apply cleanly, the built
server answers `/api/v1/health` with `db: ok`, `/api/v1/stats/public` returns
real data, and `/dashboard` correctly refuses an unauthenticated request.

## 2. What was hardened before you deploy

Two passes, both merged. Detail in the PRs; the summary matters more than the
diffs.

**Configuration (#264).** Every credential the runbook calls critical is now
enforced by the build. A half-configured production deploy stops at build time
with the missing names printed, rather than starting and failing quietly later.
Hardcoded domains, WhatsApp invite links, phone numbers and `localhost`
fallbacks are gone — real config now reaches every corner of the system.

**Security (#266–#270).** Seven findings, all closed. The two that mattered:

- A suspended member's session came back to life after five minutes, because the
  stored role version expired and a missing value was read as "nothing changed".
  Revocation now holds for the full life of the session.
- The admin console — the one that reverses transactions and suspends people —
  never checked revocation at all. Removing someone's ADMIN role did not end
  their session there.

Also fixed: per-IP rate limiting could be bypassed by anyone sending a header;
the CSP allowed inline scripts, so it documented an XSS rather than stopping
one; a dead code path granted ADMIN on registration; and a service worker would
have cached member dashboards to disk with nothing clearing them at logout.

**What was checked and found sound**, so it needn't be revisited: no SQL
injection surface, all 118 role-receiving service functions assert
authorization, all 20 member routes with an id scope to the session user, no
secrets in the browser bundle, AES-256-GCM with per-operation IVs, bcrypt cost
12 with user-enumeration defences, and password-reset tokens hashed at rest and
single-use.

---

## 3. What only you can do

Everything below needs an identity, a payment method, or a legal entity.

### 3.1 Accounts to open

| Service | For | Lead time |
|---|---|---|
| **Netcash DebiCheck** | Collecting money. Needs a registered entity, business bank account and FICA documents | **Weeks** |
| Domain registrar (`.co.za`) | Everything with a URL | Hours |
| Neon | Postgres, two branches | Minutes |
| Vercel | Three projects × two environments | Minutes |
| Resend | Email — needs the domain verified first | Minutes + DNS propagation |
| BulkSMS | SMS to members | Days if a sender ID needs approval |
| Upstash | Redis — rate limiting **and now session revocation** | Minutes |
| Inngest | The 16 scheduled jobs. Without it, no debit run happens at all | Minutes |
| Sentry | Error reporting | Minutes |
| Vercel Blob | PDF statements, signature images | Minutes |
| GitHub Pro | Restores CI and unlocks branch protection | Minutes |

Full setup order, the secret match/differ rules, and the phase gates are in
[`environment-setup-plan.md`](./environment-setup-plan.md). **Read that before
opening a single account** — the ordering saves rework, and the secret rules
prevent failures that are silent rather than loud.

### 3.2 Decisions nobody can make for you

**The domain name.** The repo previously disagreed with itself three ways. The
hardcoded values are gone and the docs say `<your-domain>`, but nothing can
proceed until you register one — DNS, email verification, the Netcash webhook
URL and all three app URLs queue behind it.

**Right to erasure (POPIA).** There is **no delete-member path anywhere** in the
system. You collect ID numbers and bank details from South African members, so
this will be asked for. It cannot be solved by deleting a row: financial records
generally must be retained even when personal data is erased, so erasure and
ledger retention have to be designed together. This is a product decision, and
it is the largest known gap.

**Audit log retention.** It grows forever and contains member identifiers. No
policy exists.

**When to open beyond the founders.** The runbook's sequence — staging → dry run
→ live keys → four founders → monitor → open up — exists so the first real debit
happens with four people who will forgive you rather than two hundred who will
not.

### 3.3 Things that will bite if skipped

- **`NETCASH_WEBHOOK_IPS`.** The app falls back to four built-in Netcash source
  IPs. If the real ones differ, every callback is rejected **while the debits
  still collect** — money moves and nothing records it. Confirm the current list
  with Netcash during onboarding. This is the single highest-consequence
  configuration item in the system.
- **`ENCRYPTION_KEY` custody.** It decrypts stored bank and ID numbers. Lose it
  and that data is unreadable forever; rotate it and the same. It needs a home
  in a password manager *before* it is pasted into Vercel, and staging must
  never share production's.
- **Upstash is now load-bearing for security**, not just performance. Session
  revocation reads it. It is required for a live build.
- **CI has not run since 2026-05-25.** Every merge since — including all of
  these — went in on local verification alone. GitHub Pro fixes it and unlocks
  branch protection.

---

## 4. Deployment: start to end

Each phase has a gate. Do not start the next until it passes.

### Start here

**Day 1 — the two long poles, in parallel**
1. Begin Netcash DebiCheck onboarding. Nothing else compresses it.
2. Register the domain, set DNS.
3. Set the domain in the environment variables of all three Vercel projects.

*Gate: the domain resolves.*

**Days 1–2 — staging**
4. Neon project, `staging` branch. `prisma migrate deploy`, then seed.
5. Three Vercel projects, Preview environment variables from `.env.example`.
6. Upstash, Inngest, Sentry, Blob for staging. Register the Inngest endpoint.
7. Resend: add the domain, publish DNS records, wait for verification.
8. `PAYMENT_GATEWAY=mock` on staging.

*Gate: all three URLs serve; `/api/v1/health` returns 200 with `db: ok` and
Redis configured; a scheduled job appears in the Inngest dashboard.*

**Whenever staging is up — exercise it**
9. Walk the whole member journey on the stand-in gateway: invite → register →
   bank account → mandate → contribution → statement PDF.

*Gate: the journey completes; inbox, email and SMS all arrive.*

**When Netcash credentials arrive**
10. Point staging at the Netcash **test** endpoint.
11. Register the webhook URL and **confirm the source IPs**.
12. Run the dry run in [`DEPLOYMENT.md`](../DEPLOYMENT.md) §6 end to end,
    including a reversal.

*Gate: every box in that checklist ticked. **Do not skip the reversal** — it is
the path that unwinds both the ledger and the pool, and the one most likely to
be wrong in a way you only discover with real money.*

**Production**
13. Neon `production` branch, migrate, seed.
14. Production environment variables — **new secrets**, except where the plan
    says they must match.
15. Netcash **live** keys and the production API URL.
16. Custom domains, then the smoke test in `DEPLOYMENT.md` §7.

### End here

17. Soft launch with the four founders. Run **one complete debit cycle** —
    generation, collection, webhook, ledger, statement.
18. Watch it. Then open to members.

**Deployment is finished when a full month's cycle has run end to end with real
money and the ledger agrees with the bank.** Not when the site loads.

---

## 5. What was deliberately not done

Recorded so it reads as a decision rather than an oversight.

- **`style-src 'unsafe-inline'`** stays in the CSP. Next and Tailwind emit inline
  style attributes no nonce can cover, and an injected stylesheet cannot
  execute — the exposure is defacement, not code.
- **6 high npm advisories** remain. All one root cause (brace-expansion), the
  patch is not backported, and the fix means two semver majors. The vulnerable
  path needs attacker-controlled glob patterns, which nothing here accepts.
- **`Error: Connection closed.`** in the browser console is React's RSC stream
  reader reporting a cancelled link prefetch. Benign. Investigated and closed —
  do not chase it again.
- **Infrastructure is entirely unassessed.** TLS, DNS, WAF, Neon network rules,
  backup and restore. None of it exists yet. **Re-run the security review once
  staging is up** — that half of the picture is still blank.

---

## 6. Where everything is written down

| Document | What it answers |
|---|---|
| **This file** | What's done, what's left, start to end |
| [`environment-setup-plan.md`](./environment-setup-plan.md) | Which accounts, in what order, which secrets must match |
| [`../DEPLOYMENT.md`](../DEPLOYMENT.md) | Vercel setup, the dry run, the smoke test, rollback |
| [`../.env.example`](../.env.example) | Every variable, with notes on each |
| [`runbook.md`](./runbook.md) | Incident response once live: failed debits, stuck webhooks, reconciliation |
