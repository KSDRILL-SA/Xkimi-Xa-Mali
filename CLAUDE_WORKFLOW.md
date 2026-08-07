# CLAUDE_WORKFLOW.md — Engineering Operating Manual

**Repository:** `Xkimi-Xa-Mali` (Xkimm Xa Mali Foundation)
**Audience:** Every AI agent and Claude Code session that touches this repository.
**Status of this document:** Authoritative. Read it before the first tool call of a session.

This is a **real-money financial platform**. A defect here does not produce a bad
render — it produces a member who was not debited, a ledger that disagrees with
the bank, or a revoked admin who still holds the power to reverse a transaction.
Engineering standards are set accordingly and are not negotiable for convenience.

---

## 1. Project Context

### 1.1 Purpose

A collective savings and contribution platform for a South African stokvel-style
brotherhood. Members hold **debit-order mandates**; the system collects monthly
contributions via **Netcash DebiCheck**, tracks them against shared savings
goals, maintains a ledger, and reconciles that ledger against the gateway.

Money moves without a human in the loop. That single fact drives every principle
in section 2.

### 1.2 Architecture overview

A **Turborepo/npm-workspaces monorepo** — three Next.js 16 applications over six
shared packages, one PostgreSQL database, and an Inngest job runtime.

```
apps/
  web       @xxm/web       Member portal   — auth, mandates, contributions, goals, PWA
  admin     @xxm/admin     Admin console   — members, approvals, reversals, reports
  website   @xxm/website   Marketing site  — public, unauthenticated
packages/
  database  @xxm/database  Prisma schema (35 models, 28 migrations), seed, repositories
  ui        @xxm/ui        Shared React component library
  utils     @xxm/utils     cn, formatters, date helpers, SA validators, zod schemas
  types     @xxm/types     Shared domain types
  config    @xxm/config    Shared tsconfig, tailwind preset, eslint config
  observability @xxm/observability  Structured logging + error reporting
```

### 1.3 Applications

| App | Runtime shape | What it is trusted with |
|---|---|---|
| `@xxm/web` | Next.js App Router; **Edge middleware** + Node route handlers | Member auth, mandate capture, contribution display, **all 18 Inngest jobs including the debit run** |
| `@xxm/admin` | Next.js App Router; **Node middleware** (can reach Postgres) | Member status/role changes, mandate approval, **transaction reversal**, broadcasts, reports |
| `@xxm/website` | Static-leaning marketing pages | Nothing privileged. No session, no database writes |

**The two authenticated apps share one database and one Redis instance.** They do
*not* share middleware code. A change to session or role handling in one is not a
change in the other — this asymmetry has already caused shipped bugs (see §4).

### 1.4 Shared packages

Changes to `packages/*` fan out to all three apps. Treat any edit under
`packages/` as a multi-app change and verify all three build.

`@xxm/config/tailwind/base.ts` in particular defines the design tokens every app
consumes (`font-display` → `var(--font-display)`, the `xxm-*` colour scale). A
token removed here fails silently at runtime, never at compile time.

### 1.5 Financial system responsibilities

The money path, in order:

1. **Mandate capture** — member's bank details encrypted at rest (AES-256-GCM),
   submitted to the gateway, mandate authorised.
2. **Debit run** (`apps/web/inngest/functions/debit-run.ts`, cron `0 16 * * *` =
   18:00 SAST) — finds active mandates due today, claims an idempotency key,
   submits to the gateway, writes a `Transaction`, recalculates contribution
   status, notifies the member.
3. **Webhook ingestion** (`apps/web/app/api/v1/webhooks/netcash`) — gateway
   callbacks settle pending transactions.
4. **Ledger reconciliation** (`ledger-reconciliation.ts`) — nightly, compares the
   ledger against gateway state.
5. **Reversal** — admin-initiated, gated by `admin-action.ts`.

**Invariants that must never be broken:**

- A debit is submitted **at most once** per mandate per period. The idempotency
  key is `debit:run:<mandateId>:<YYYY-MM>`, held in both Redis (72h) and the
  `Transaction.idempotencyKey` unique column.
- A failed collection is **never silent**. If a member is not debited, that fact
  must reach the error tracker and a human.
- The mock gateway **must not** run on a live deployment.
  `apps/web/integrations/payment/index.ts` throws at module load if it would.
- Plaintext bank/ID numbers are decrypted only when they are being *acted on*.
  For display, use `maskStoredSecret` / `tryDecrypt`, which degrade rather than
  throw. **Never** substitute a placeholder into a gateway submission.

### 1.6 Security requirements

| Control | Where it lives | Failure mode if broken |
|---|---|---|
| Session freshness (`roleVersion`) | `web/middleware.ts`, `admin/middleware.ts`, `admin/lib/admin-action.ts` | A revoked admin keeps every power in their JWT until it expires |
| Role-version publication | `admin/lib/role-version.ts`, `web/lib/role-version.ts` — key `xxm:role-version:<userId>`, **no TTL, ever** | Revocation silently lapses |
| Verdict policy | `web/lib/role-version-policy.ts` | Privileged sessions **fail closed**, member sessions **fail open**. Do not "simplify" this asymmetry |
| CSP with per-request nonce | `web/middleware.ts:buildCsp` | `script-src 'unsafe-inline'` turns an XSS from blocked into executed. Costs static prerendering — that trade is deliberate |
| CSRF origin check | `web/lib/csrf-origin.ts` | Cross-origin state mutation |
| Constant-time secret compare | `web/middleware.ts:constantTimeEqual` | `ADMIN_API_SECRET` leaks via response timing |
| Encryption at rest | `web/lib/encryption.ts` (AES-256-GCM) | PII exposure. **No key rotation exists** — see §4 |
| Rate limiting | `web/lib/redis.ts` | Unconfigured Redis = limiter allows everything. Required when live |
| Config validation | `web/lib/env.ts`, `admin/lib/env.ts` (`requiredWhenLive`) | A live deploy starts without the credentials it needs |

**Redis is load-bearing for authorization, not just for caching.** Any change
that touches it is a security change.

### 1.7 Deployment model

- **Three Vercel projects**, one per app, all from this monorepo. Install command
  `npm ci` at the root.
- **Neon PostgreSQL.** Migrations run over the unpooled (`DIRECT_DATABASE_URL`)
  endpoint; the app uses the pooled one.
- **Upstash Redis** — shared by both authenticated apps.
- **Inngest** hosts the 18 scheduled jobs.
- **CI:** `.github/workflows/ci.yml` — `npm ci` → `db:generate` → `migrate deploy`
  → `db:seed` → `typecheck` → `lint` → `test` → `build` → `prisma validate`.
- Gateway selection is by `PAYMENT_GATEWAY` env var; anything other than `mock`
  selects Netcash. `DEPLOY_ENV=ci` relaxes the production-only config rules.

---

## 2. Engineering Principles

These are ordered. When two conflict, the lower number wins.

1. **Financial integrity first.** Correct money movement outranks throughput,
   elegance, and delivery date. If a change could cause a double-debit, a missed
   debit, or a silent collection failure, it does not ship until that path is
   proven.
2. **Authorization before convenience.** A guard that is annoying is still a
   guard. Never relax a check to make a test pass, a build succeed, or a module
   easier to import — fix the test, the build, or the import.
3. **Security before optimization.** Caching, prerendering, and round-trip
   elimination are all negotiable. The controls in §1.6 are not. Where a security
   control has a performance cost, that cost is documented in the code and stays.
4. **Correctness before refactoring.** Fix the bug, prove the fix, then consider
   whether the surrounding code should change — in a separate commit.
5. **Evidence before assumptions.** "The tests pass" is not evidence that the
   build works. "It typechecks" is not evidence the runtime behaves. Run the
   command, read the output, quote it. Claims about external APIs are verified
   against the vendor's documentation, not against this codebase.
6. **One issue at a time.** One root cause, one fix, one branch, one PR. A commit
   that fixes two things is two commits.
7. **Never modify unrelated code.** Formatting churn, drive-by renames, and
   opportunistic upgrades hide the real change in the diff and defeat review.

---

## 3. AI Model Selection Policy

**Default model: Sonnet High.** Escalate deliberately, then come back down.

### 3.1 Use Sonnet High for

- Feature implementation
- Bug fixing (single, understood root cause)
- Unit tests and integration tests
- Refactoring within a small scope (one module, one component)
- CI fixes
- Dependency updates
- Documentation updates
- API route implementation
- React components and UI work
- Prisma schema changes and migrations
- Day-to-day development

### 3.2 Automatically escalate to Opus High for

- Authentication redesign
- Authorization redesign
- Security audits
- Architecture reviews
- Repository-wide refactors
- Financial workflow changes
- Payment gateway integration
- Netcash investigations
- Database redesign
- Performance investigations
- Production incidents
- Complex debugging running longer than **30 minutes**
- Cross-application issues spanning `web` + `admin` + `packages`

### 3.3 Decision rule

> **If the task spans more than 3 subsystems, or requires architectural reasoning,
> switch to Opus High.**
>
> **After planning is complete, switch back to Sonnet High for implementation.**

Count subsystems generously: `apps/web`, `apps/admin`, `apps/website`,
`packages/database`, other `packages/*`, CI, and the dependency tree each count
as one.

### 3.4 Escalation triggers in practice

Escalate mid-task, without being asked, when any of these appear:

- The same test or build has failed **three times** for reasons you did not predict.
- The fix requires changing a file you did not expect to open.
- You are about to touch anything listed in §1.6.
- The root cause is in a **different app** from the symptom.
- You are reasoning about an external API's contract rather than this code's.

De-escalate to Sonnet High once the plan is written, the affected files are
listed, and what remains is mechanical.

---

## 4. Repository Audit History

Two audits are recorded: the **original findings** and the **post-remediation
verification (2026-08-07)** that confirmed which of them actually closed.

> Do not re-litigate closed findings. Do not assume open ones are still open
> without re-running the evidence command listed.

### 4.1 Confirmed Critical findings

| # | Finding | Current status | Evidence |
|---|---|---|---|
| C-1 | **Role-version propagation bug** — admin bumped `roleVersion` in Postgres but never published it to the Redis key the member app's Edge middleware reads, so revocation did not reach the request path | ✅ **Fixed** | `admin/lib/services/members.ts:98-107`, `invitations.ts:66-74` now publish `updated.roleVersion`. All three `roleVersion: { increment: 1 }` sites in the repo publish. Covered by `admin/__tests__/role-version-publish.test.ts` |
| C-2 | **Redis authorization resilience** — a missing key read as version 0 (never stale), and a 300s TTL meant revocations silently lapsed | ✅ **Fixed** | Keys written without TTL (`web/lib/role-version.ts:52-63`). Three-state verdict in `web/lib/role-version-policy.ts`; privileged fail closed, members fail open. Guards for null / non-finite / throw at `web/middleware.ts:84-93` |
| C-3 | **Netcash integration verification requirement** — `lib/netcash.ts` issues JSON POSTs to REST paths against a SOAP `.asmx` endpoint; the adapter is built against the wrong API shape | 🔴 **Open — by design.** Documented, not coded | `docs/completion-guide.md` §2.5. Requires provisioned sandbox credentials before it can be rebuilt. `IPaymentGateway` is the correct seam; everything behind it is unaffected |

### 4.2 Confirmed High findings

| # | Finding | Current status | Evidence |
|---|---|---|---|
| H-1 | **Debit-run isolation** — one failing mandate aborted the whole run | ✅ **Fixed** (2026-08-07) | Isolation kept; the silence removed. The catch now sits *outside* `step.run`, so Inngest still retries a blip itself and only an exhausted retry is recorded — as a `FAILED` transaction, which is what the daily `transaction-retry-failed` job queries. Also found and fixed in the same pass: the gateway's three outcomes (`SUCCESS`/`PENDING`/`FAILED`) were collapsed into two, so a **decline was filed as PENDING** — invisible to the retry job, waiting on a webhook that was never coming, and the member told "pending". The `debit-declined` template had been seeded since the templates were written and **never once sent**. Mapping now goes through `toTransactionStatus()`, which a test holds to it |
| H-2 | **Dependency tree cleanup** | ✅ **Fixed** (2026-08-07). `npm audit` 1 high → **0**. `js-yaml` 4.3.1, `brace-expansion` 2.1.4, `eslint-config-next` 16.3.0 (was linting Next 16 with the Next 15 config), postcss dropped from the apps and nested correctly under Next, root `@vercel/blob` pin removed. Root cause was M-8, not a version mismatch. Two `npm ls` complaints remain and are upstream — see §4.4 | `npm audit` → 0 |
| H-3 | **CI reliability** | ⚠️ **Build fixed, CI still not verifying.** `npm run build` exits 0 (3/3) and an `npm audit --audit-level=high` gate is now in the workflow. But per `DEPLOYMENT.md` §8 GitHub Actions minutes are exhausted on the free tier, so **the workflow is not executing at all** — every fix in this table was verified locally and nothing automated is checking them | `npm run build` → exit 0 |
| H-4 | **Seed-flow reliability** — seed required a developer-local env file, breaking CI | ✅ **Fixed** | `packages/database/package.json` chains `--env-file-if-exists` for all three apps; `prisma/seed.ts:22-27` skips the founder block with a log line when `FOUNDER_*` is absent |
| H-5 | **Encryption key rotation strategy** | ⚠️ **Mitigated, not solved.** `tryDecrypt`/`maskStoredSecret` degrade unreadable ciphertext instead of taking the page down. Rotation itself does not exist: one key, no key identifier in the envelope, no previous-key fallback. Tracked as **P2 · BEFORE REAL DEBITS** in `SECURITY-HARDENING.md:10` | `web/lib/encryption.ts:9-35` |

### 4.3 Medium findings

| # | Finding | Current status |
|---|---|---|
| M-1 | **CSP hardening** | ✅ **Fixed.** Per-request nonce; `script-src 'unsafe-inline'` removed; `base-uri` and `form-action` locked. Cost — 13 public pages became dynamic — is documented in `web/app/layout.tsx` and accepted |
| M-2 | **POPIA compliance planning** | 🟡 Partial. Right-to-erasure honoured in member listings; consent captured at registration. Retention policy and DSAR process not yet formalised |
| M-3 | **Monitoring improvements** | 🟡 Partial. `@xxm/observability` + Sentry wired across apps. Gaps: no alert on failed debit collections (see H-1), no dependency-health gate in CI, `SECURITY-HARDENING.md` tracks "CI security gate" as P2 |
| M-4 | **Integration testing expansion** | 🟡 **Improved** (2026-08-07): 801 tests, and the debit run is now covered end to end. `executeDebitRun(step)` takes the step runner as a parameter, so a stub drives the whole job without an Inngest server — 13 cases over gateway throw, decline, success, and the mandates that must be left alone. Validated by mutation: reintroducing the FAILED→PENDING collapse fails exactly the three cases describing it. **Still partial** — the other 17 Inngest jobs have no equivalent seam, and `ledger-reconciliation` and `transaction-retry-failed` both touch money |
| M-5 | **Web display font silently removed** | ✅ **Fixed** (2026-08-07). Loader restored; build green with it. The stub had been introduced on the assumption Google Fonts could not be fetched at build time — that assumption was wrong, so the regression bought nothing |
| M-6 | **Admin `role-version.ts` bypasses validated config** | ✅ **Fixed** (2026-08-07). Reads through `lib/env` again. The stated reason for the bypass — that the strict module broke isolated tests — had a counter-example in the same directory: `role-revocation.test.ts` was already mocking `@/lib/env`. Four suites that reach the module transitively now do the same |
| M-7 | **Crypto envelope doc/code drift** | ✅ **Fixed** (2026-08-07). Both diagrams now describe `base64(iv ‖ authTag ‖ ciphertext)` with a 16-byte IV, matching `lib/encryption.ts` |
| M-8 | **`overrides` added after a tree exists are silently ignored** | ✅ **Fixed** (2026-08-07). `overrides` apply during *resolution*, but with `node_modules` present npm reports `up to date` and rebuilds the lockfile **from the tree** instead of re-resolving — so `brace-expansion` (`^2.1.4` → 1.1.18/5.0.9) and `js-yaml` (`^4.3.1` → 4.3.0, the vulnerable one) were never applied; `sharp` and `undici` only looked right because their natural resolution matched. Fixed by regenerating the lock with `node_modules` absent. **Consequence worth acting on: any past remediation credited to an override needs re-verification against the installed tree, including the 63→0 dependency-hardening result** — `npm audit` reads the tree, so a clean report is real, but the mechanism credited for it was not working. Adding an override is not the same as applying one; confirm with `npm ls <pkg>` |

### 4.4 The dependency fix (H-2 / M-8) — landed 2026-08-07

**Outcome: `npm audit` went from one high-severity advisory to zero.** Verified
with typecheck 0, test 0 (788), build 0 (3/3). Kept here because the mechanism
is non-obvious and will catch the next person who edits `overrides`.

**The actual cause — and it is not what it looks like.** `overrides` are applied
during *dependency resolution*. When `node_modules` already exists, `npm install`
(and `npm install --package-lock-only`) treat the materialised tree as
authoritative — they report `up to date` and rebuild the lockfile *from the
tree*, never re-resolving. So an override added to `package.json` after a tree
exists is silently ignored, for that package, forever. The original lockfile was
generated in exactly that state, and every install since inherited it.

**The single step that matters: regenerate the lock with `node_modules` absent.**

```bash
mv node_modules node_modules.bak      # or delete it
rm -f package-lock.json
npm install --package-lock-only       # true resolve, writes no tree, ~3 min
```

Verify in the regenerated lock *before* installing anything: `js-yaml` must be
`4.3.1` and `brace-expansion` a single `2.1.4`. If they are not, the resolve did
not happen — check that `node_modules` was really gone.

A tempting wrong turn, recorded so it is not retried: `npm explain postcss` shows
`postcss@"8.5.23" from next@16.3.0`, an *exact* pin, which looks like an
unsatisfiable-override problem. It is not. On a true resolve npm simply nests —
`node_modules/postcss@8.5.26` for Tailwind/autoprefixer and
`node_modules/next/node_modules/postcss@8.5.23` for Next. Removing the postcss
override (step 1) is still correct because it is genuinely redundant, but it is
**not** what unblocks the others.

1. **Remove `postcss` from `overrides`** in the root `package.json`.
2. **Remove `postcss` from `devDependencies`** in all three apps. Nothing imports
   it — the `postcss.config.js` files only name plugins, and `autoprefixer` takes
   it as a peer (`^8.1.0`, which Next's 8.5.23 satisfies). Next owns it.
3. **Add `"js-yaml": "^4.3.1"`** to `overrides` (4.3.1 is the patch for
   GHSA-5p4m-2wfm-xmqj; `@eslint/eslintrc` accepts `^4.3.0`).
4. **Bump `eslint-config-next` to `^16.3.0`** in all three apps — it currently
   sits at 15.x while `next` is 16.3.0, so Next 16's own lint rules never run.
5. **Remove the root `dependencies: { "@vercel/blob": "2.6.1" }`** — a hoisting
   workaround. Both real consumers (`apps/web`, `apps/admin`) declare `^2.6.1`
   themselves; the root entry only pins the tree to exactly 2.6.1.
6. **Delete `package-lock.json` and `node_modules`, then `npm install`.** The
   lock must be regenerated — an in-place install will not re-resolve.
7. **Verify:** `npm ls --all` exits 0, `npm audit` reports no high severity,
   `js-yaml` resolves to 4.3.1 and `brace-expansion` to 2.1.4 (both were confirmed
   in the partial tree), then `typecheck` / `test` / `build` all exit 0. Confirm
   the Tailwind/PostCSS pipeline still works — step 2 is the one with real risk.
8. **CI gate:** `npm audit --audit-level=high` after `npm ci`. **Do not gate on
   `npm ls --all`** — it exits 1 on upstream conflicts this repo cannot fix, and
   a gate nobody can satisfy is a gate that gets disabled.

**Two `npm ls` complaints are expected and are not regressions:**

- `brace-expansion@2.1.4 invalid` — `minimatch` wants `^1.1.7`, `glob/minimatch`
  wants `^5.0.8`. No single version satisfies both, so this override was *always*
  wrong; it only looked harmless while it was inert. Left in place because 2.x is
  API-compatible here and `npm audit` is clean with it applied. Removing it needs
  a full re-resolve and risks reopening the advisory it was added for — do not
  touch it casually.
- `magicast@0.5.4 invalid` — via `@prisma/config`'s nested `c12`. Upstream,
  pre-existing, present before any of this work.

### 4.5 The 63→0 hardening claim, re-verified

Checked 2026-08-07, because M-8 meant the mechanism it was credited to had not
been running. **The tree is genuinely clean — `npm audit` reports 0 — but the
claim was not true when made: it was 1 high, not 0.** What each override was
actually doing:

| Override | What the consumer asks for | Verdict |
|---|---|---|
| `sharp` `^0.35.3` | `next` itself requests `^0.35.3` | Redundant |
| `undici` `^6.28.0` | `@vercel/blob` asks `^6.23.0` | Raises the floor, but natural resolution already lands ≥6.28 |
| `brace-expansion` `^2.1.4` | `minimatch` `^1.1.7`, `glob/minimatch` `^5.0.8` | Mis-specified — satisfies neither |
| `js-yaml` `^4.3.1` | `@eslint/eslintrc` `^4.3.0` | Load-bearing (added 2026-08-07) |

So none of the four original overrides were protecting anything: natural
resolution was already landing safe versions, which is exactly why their being
inert went unnoticed. **The lesson is about evidence, not about npm** — the
result was reported from `package.json` rather than from the installed tree.
Verify a dependency claim with `npm audit` and `npm ls <pkg>`, never by reading
a manifest.

### 4.6 A process trap that cost an afternoon

**A "killed" background task does not kill the `npm` process underneath it.**
The task wrapper stops; npm keeps reifying `node_modules`.

Every install launched after an apparent kill therefore races a survivor, and
the symptom is `ENOTEMPTY: directory not empty, rmdir ...` — which reads exactly
like antivirus interference or a slow disk, and is neither. Five installs failed
this way before the cause was found; killing the orphan made the very next
attempt succeed.

Before launching any install, check:

```bash
# PowerShell — look for npm-cli.js with a CreationDate you did not start
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CreationDate, CommandLine
```

Kill stale npm processes for *this* repo before retrying. Do not kill unrelated
global installs. And prefer chaining install → verify in a single command over
launching them separately, so nothing can overlap.

---

## 5. Engineering Workflow

### 5.1 Every new session must

1. **Read this file.**
2. **Read open issues** — §4 above, plus `docs/completion-guide.md`.
3. **Read the remediation roadmap** — `SECURITY-HARDENING.md` (P1/P2/P3 bands) and
   `docs/environment-setup-plan.md`.
4. **Verify current branch** — `git status && git branch --show-current`.
   Work branches from `Dev`. PRs target `Dev`. Never commit directly to `main`.
5. **Verify build status** — `npm run build`.
6. **Verify test status** — `npm run test`.

Steps 5 and 6 establish the baseline. **A failure you did not cause is not
yours to silently inherit** — record it, then state clearly in your final report
which failures pre-existed your change.

### 5.2 Before making changes

- **Identify root cause.** Not the symptom, not the stack-trace line. If you
  cannot name the cause, you are not ready to edit.
- **Explain the solution** in prose, before code.
- **List affected files** explicitly, with line ranges where known.
- **Estimate risk** against §1.5 and §1.6: does this touch money, auth, or PII?

### 5.3 After making changes

Run all three, in this order, and read the output:

```bash
npm run typecheck
npm run test
npm run build
```

Then **document results** — actual exit codes and actual failure text. Do not
report "tests pass" without having run them in this session. Do not report a fix
as verified when only the unit tests were run and the failure was in the build.

### 5.4 Branch and commit conventions

- Branch per task, off `Dev`: `fix/<short-slug>`, `feat/<short-slug>`, `chore/<short-slug>`.
- Commit messages describe **the user-visible change or the bug that is now gone**,
  not the mechanics of the edit.
- **Never reference AI, Claude, or any assistant in a commit message, branch
  name, PR title, or PR body.** This is absolute.
- A major dependency upgrade is never a `chore:` — H-2/H-3 above exist because a
  Next 15 → 16 major landed inside one.

---

## 6. Prohibited Behaviors

Do **not**:

- **Refactor unrelated files.** Including formatting, import reordering, and
  renaming things you happened to read.
- **Rewrite working systems.** If it passes its tests and serves its purpose, it
  is not yours to redesign because you would have built it differently.
- **Introduce new dependencies without justification.** State what it does, why
  the standard library or an existing dependency will not, and its transitive
  weight. Check `npm ls` and `npm audit` afterwards.
- **Change business rules without approval.** Contribution amounts, fee
  calculations, debit days, grace periods, badge thresholds, and goal funding
  rules are the owner's decisions, not engineering's.
- **Modify financial workflows without explicit verification.** Anything under
  `apps/web/inngest/functions/`, `apps/web/integrations/payment/`,
  `apps/web/services/{contribution,goal-payment,ledger}*`, or the `Transaction` /
  `Contribution` / `PaymentMandate` models. Say what you are changing and get
  agreement first.
- **Touch authentication or authorization casually.** Everything in §1.6.
  Specifically forbidden without explicit, separate approval:
  - adding a TTL to a `xxm:role-version:*` key
  - making a missing Redis key read as version `0`
  - making `unverifiable` fail open for privileged sessions
  - reintroducing `'unsafe-inline'` to `script-src`
  - weakening a guard to make a test or an import work
- **Swallow an error on the money path.** A caught exception must reach the
  logger from `@xxm/observability` and must change the outcome the caller sees.
  `console.error` is not a substitute (see H-1).
- **Report success you have not verified.** A green test run is not a green build.

---

## 7. Session Startup Checklist

Answer these five before the first edit:

1. **What issue are we solving?** State it in one sentence, as a behaviour that
   is wrong.
2. **Has this issue already been audited?** Check §4. If it is listed as fixed,
   verify before reopening. If listed as open, read the evidence line first.
3. **Is Sonnet High sufficient?** Apply §3.1.
4. **Does this require Opus High?** Apply §3.2 and the §3.3 decision rule. When
   genuinely uncertain, escalate — the cost of over-escalating is a slower
   session; the cost of under-escalating on this repository is a money bug.
5. **What tests will verify the fix?** Name them. "The existing suite" is not an
   answer if the existing suite already passed while the bug was present.

---

## 8. Session Completion Checklist

Before ending a session, record all six:

- [ ] **Documentation updated** — this file's §4 if audit status changed;
      `docs/` if behaviour changed; `DEPLOYMENT.md` if the deploy story changed.
- [ ] **Findings recorded** — anything discovered but not fixed, with enough
      detail for the next session to resume without rediscovering it.
- [ ] **Modified files recorded** — full list, with the reason for each.
- [ ] **Remaining work recorded** — what was scoped out, and why.
- [ ] **Risks recorded** — what could break, who it affects, how it would be
      noticed.
- [ ] **Recommended next actions** — ordered, with effort estimates.

State plainly what was **not** done. Scaling work down is the owner's decision,
never the agent's.

---

## 9. Future Goal

The repository is working toward:

| Target | Current | Gate |
|---|---|---|
| **Production readiness ≥ 90/100** | Below — CI is red (H-3) | Build green on all three apps |
| **Full CI validation** | 7 of 8 steps pass | Build passes; add `npm ls` + `npm audit` gates |
| **Financial workflow verification** | Unit-tested only | An end-to-end debit-run test through Inngest; failed collections alert a human (H-1) |
| **Netcash verification** | Adapter built against the wrong API | Sandbox credentials → rebuild adapter → full dry run in test mode (C-3) |
| **Complete authorization consistency** | Strong, with one gap | Close M-6; keep `web` and `admin` middleware behaviour deliberately aligned |
| **Encryption key rotation support** | Absent | Versioned envelope + previous-key fallback + re-encrypt backfill (H-5) |
| **Operational monitoring** | Partial | Alerting on failed debits, ledger drift, and role-version publish failures |
| **Public launch readiness** | Blocked on Netcash onboarding (weeks) | Soft launch with the four founders through one full debit cycle |

**The recurring failure mode to guard against:** three of the audited
remediations were applied to one app and not its sibling. This monorepo has three
Next apps over shared packages, and nothing in CI verifies that a cross-cutting
fix landed everywhere. Until that gate exists, **any fix to `web` must be
consciously evaluated against `admin`, and vice versa.**

---

*Maintained as part of the repository. Update §4 whenever an audit status
changes — a stale audit history is worse than none, because it is trusted.*
