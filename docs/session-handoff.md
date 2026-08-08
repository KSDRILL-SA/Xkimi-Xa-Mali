# Session Handoff

**Session closed:** 2026-08-08
**Branch state at close:** `main` is the **only** branch. No open pull requests.
**Health at close:** typecheck 0 · lint 0 errors (5 warnings, all pre-existing
files) · test 0 — **1029 passing** (was 941) · build 0 (3/3) · `npm audit` 0.

Everything below was verified locally. **CI is still not executing** — GitHub
Actions minutes are exhausted on the free tier. Nothing automated is checking
this repository.

> The previous handoff (2026-08-07) is preserved in git history at `1151cc5` if
> you need what it said.

---

## 1. Start here — the four things that will bite you first

**1. `main` is the only branch now.** The `Dev` integration branch was merged and
deleted on the owner's instruction. Cut feature branches from `main`,
`gh pr create --base main`, squash-merge, delete. CI triggers on `main` only.
**Do not recreate `Dev`.**

**2. Run `npm run db:generate` immediately after any branch switch.** The
generated Prisma client lives in the repository-root `node_modules` and is *not*
per-branch. The signature is **a green `typecheck` and a red `next build` on the
same tree**, because Turbo replays a cached typecheck while `next build` runs its
own `tsc`. Recorded as §4.11 in `ENGINEERING_WORKFLOW.md`.

**3. `rm -rf apps/*/.next` after a branch switch too.** Next's generated
`.next/types/validator.ts` still imports routes from the other branch.

**4. The website build needs the network.** All three apps use
`next/font/google`, which fetches from `fonts.googleapis.com` at build time. A
DNS blip fails the build with `next/font: error:` and nothing is wrong with the
code — re-run. This happened twice this session.

---

## 2. What was done

Six PRs, all squash-merged to `main`.

| PR | What was actually wrong |
|---|---|
| #292 | `ENCRYPTION_KEY` was documented "set once, never change" — a leaked key could not be replaced, because replacing it made every stored bank and ID number unreadable |
| #293 | Alerts existed but every one ended at an in-app inbox message. On debit night "nine contributions were not collected" was filed in a page nobody had reason to open |
| #294 | Every alert channel routed through an ACTIVE admin's account. With one admin, that chain had no spare link |
| #295 | Three unrelated suites failed together at random, ~1 run in 4. One test file replaced `process.env` wholesale, leaking environment between files sharing a Vitest worker |
| #296 | The Founder badge — conferred, permanent, kept off the tier ladder |
| #297 | #296 shipped with no way to grant it. Now managed on the member's own admin page |

Plus `bfa5aac`: `main` became the only long-lived branch, and every workflow
document was updated to say so.

---

## 3. Decisions the owner took — do not re-litigate these

| Question | Decision |
|---|---|
| Branching | `main` only. `Dev` deleted 2026-08-08 |
| How many admins? | **One** — the owner. The other three founders are plain `MEMBER`s. He may assign `ADMIN` later; assume one until told otherwise |
| Founder badge storage | A `MemberDistinction` record — not a boolean, not a fifth `BadgeTier` |
| Is it revocable? | **Permanent**, survives `RESIGNED`. Removal exists only as an *erratum* for a badge on the wrong account, and demands a reason |
| Can an admin self-grant? | **Yes** — with one admin who is himself a founder there is no alternative. Recorded as `selfGranted` in the audit payload |
| How many founders? | **Four**, enforced by `FOUNDER_COUNT` |
| Where is it managed? | The member's own admin page, beside status and role — **not** the Badges page |

---

## 4. Outstanding

### 4.1 The Netcash dry run — still the only real gap

Unchanged from the last handoff. **The adapter has never spoken to a live Netcash
account.** It is built against the vendor's published contract (live WSDL + XSD)
and covered by 21 contract tests. **A contract test is not a settlement.**

1. Obtain the Netcash account and its **debit order service key**.
2. Set `NETCASH_DEBICHECK_TEMPLATE_ID` — **required when live; the app refuses to
   boot without it.**
3. Call `checkServiceKey()` (`apps/web/lib/netcash.ts`) — read-only and cheap.
4. Run **one** member through **one** full cycle in test mode before anyone else.

**An ISV agreement is not required.** Netcash publishes a default software vendor
key; a vendor-specific GUID is optional.

### 4.2 Set `ALERT_FALLBACK_EMAIL` before going live

Not optional in practice, despite being an optional variable. With a single
admin, every other alert channel depends on one account being active, one phone
being reachable, and the notification worker being alive. This is a standing
address — a shared mailbox — that receives every **critical** alert, needs no
account, and is sent directly rather than queued.

Unset today. `DEPLOYMENT.md` and `docs/runbook.md` both say to set it.

### 4.3 Deploy prerequisites — migrations

**Two new migrations this session**, both additive, both applied and verified
locally (`prisma migrate status` reports no drift):

```
20260808120000_admin_alert_templates    -- the two admin alert templates
20260808130000_member_distinctions      -- DistinctionKind enum + table + FKs
20260808130001_founder_badge_template   -- the grant notification
```

Seven more from the previous session were still unapplied on the local database
and were applied this session. **37 migrations total.**

Run migrations with:
```
cd packages/database && node --env-file-if-exists=../../apps/web/.env.local \
  ../../node_modules/prisma/build/index.js migrate deploy
```
`npm run db:migrate` is `migrate dev`, which prompts and needs shadow-database
permissions the local user does not have.

### 4.4 Staging has no branch any more

`docs/environment-setup-plan.md` mapped `Dev` → staging. With `Dev` gone,
**staging needs its own long-lived `staging` branch off `main`**, created when
that environment is stood up. Until then, per-PR previews are the only
non-production environment — enough to review a change, **not** enough to
rehearse a debit cycle.

### 4.5 Still open from before

- **CI restoration (H-3)** — the workflow is correct and not running. Blocked on
  a billing decision.
- **The Founder Guide PDF** — GitHub still serves the pre-rewrite commit
  `d3ddd74` and blob `3bf2752348503a60bae2e1039cc7835d85ff8446` by direct SHA.
  Only the repository owner can open the GitHub Support request to purge it.
- **`RESIGNED` members keep the ability to sign in** — this codebase's reading of
  "leave at any time, with your history intact". An interpretation, not a
  quotation. One line in `apps/web/lib/auth.ts` if the founders disagree.

---

## 5. What is worth knowing about the new code

### The encryption keyring (#292)

Ciphertext is now `v1.<keyId>.<base64(iv ‖ tag ‖ ciphertext)>`. Values written
before this carry no key id and are read by trying every key on the ring — safe
because GCM authenticates. **Do not "clean up" that legacy path**; every row
written before 2026-08-08 depends on it.

`packages/utils/src/keyring.ts` has **no application imports** — no env, no
logger, no database — because the running app and the backfill script must agree
byte for byte and the script cannot load the app's env. It is deliberately absent
from the `@xxm/utils` barrel, which reaches client components.

**The trap:** `packages/database/scripts/reencrypt-secrets.ts` carries an
explicit list of encrypted columns. A new encrypted column not added there means
a rotation reports success while leaving that column pinned to a key you are
about to delete.

Procedure: `docs/runbook.md` → "Rotating the encryption key". Three steps; step 3
is what actually ends an exposure.

### Alerting (#293, #294)

`apps/web/services/alert.service.ts` is the only way to raise an operational
alert. Severity routes it: `critical` → inbox + email + SMS + fallback,
`warning` → inbox + email. It **never throws** — an alert is raised because
something already went wrong.

Codes: `DEBIT_RUN_INCOMPLETE`, `LEDGER_DRIFT_DETECTED`, `SCHEDULED_JOB_FAILED`,
`FINANCIAL_ANOMALY_DETECTED`. Documented in `docs/runbook.md` → "What reaches you
without you looking", with the three ways alerting can itself be down.

**Not covered:** a job that *never fires*. There is no heartbeat, so a cron that
silently stops scheduling is only visible in the Inngest dashboard.

### The Founder badge (#296, #297)

Read `docs/founder-badge-plan.md` before changing anything here.

**The governing fact:** `BadgeScore.currentBadge` is *derived* —
`recalculateOne` rewrites it from `determineTier(metrics)` on every run, and the
job fires monthly **and on every contribution status change**. A `FOUNDER` value
in `BadgeTier` would be silently overwritten the next time that founder paid.

**`badge.service.ts` must never read `MemberDistinction`.** Composition happens
in `withFounderFlag` and at the call sites. A test asserts the badge service
source file does not contain the word "distinction" — that assertion is the
guard, not an accident.

`apps/website/lib/founders.ts` checks its roster length against `FOUNDER_COUNT`
at compile time. Add a fifth founder to either without the other and the build
stops.

### Adding a notification template

Two gates in `packages/database/__tests__/template-encoding.test.ts` will reject
you, and both are right:
1. Every **SMS** body must contain `Xkimm Xa Mali Foundation`.
2. Every `{{placeholder}}` needs an entry in that file's `SAMPLE` map, or the
   segment cost cannot be measured.

Also: the seed (`prisma/templates.ts`) and the migration must carry **identical**
text, and admin-facing slugs belong in `MANDATORY_SLUGS`.

### Never assign to `process.env` in a test (#295)

Vitest reuses a worker thread across files. Replacing `process.env` wholesale
detaches it from the object every other file's `vi.stubEnv` references. Use
`vi.stubEnv` / `vi.unstubAllEnvs`. Now enforced by a `no-restricted-syntax` rule
over `apps/web/__tests__/**`. Recorded as §4.12.

---

## 6. Risks

| Risk | Who it affects | How you would notice |
|---|---|---|
| **`ALERT_FALLBACK_EMAIL` unset on a live deploy** | Everyone, silently | Nothing. That is the point — with one admin, a suspended account means no alerts and only a log line |
| **`NETCASH_DEBICHECK_TEMPLATE_ID` unset on a live deploy** | Everyone — the app will not boot | Deploy fails at env validation |
| **Netcash adapter never exercised live** | Every member, on the first collection | A batch rejected wholesale. Mitigate by running one member first |
| **Migrations not run before deploy** | Everyone | Prisma errors on any query touching the new tables |
| **A key removed from `ENCRYPTION_PREVIOUS_KEYS` too early** | Every member with a bank account | `secrets:reencrypt` exits non-zero and lists the rows. **Do not proceed past that** |
| **CI still not executing** | Everyone | Nothing automated is checking this repository |

---

## 7. Recommended next actions, in order

| # | Action | Effort | Blocked on |
|---|---|---|---|
| 1 | Apply to Netcash; obtain account, service key and mandate template id | Days–weeks | External |
| 2 | Set the live env vars (**including `ALERT_FALLBACK_EMAIL`**), run `migrate deploy`, call `checkServiceKey()` | 1 hour | Action 1 |
| 3 | One member, one full debit cycle in test mode, end to end | Half a day | Action 2 |
| 4 | Click through the Founder badge flow once on a real deploy — grant, check the members list, the member dashboard and a statement PDF, then remove | 20 min | A deploy |
| 5 | Create the `staging` branch and stand that environment up | Half a day | Owner |
| 6 | Confirm the `RESIGNED` sign-in interpretation with the founders | Minutes | Founders |
| 7 | Restore CI (H-3) | Half a day | Billing decision |
| 8 | GitHub Support request to purge the Founder Guide PDF blob | 15 min | Owner only |

---

## 8. What was explicitly not done

- **No live Netcash call.** Not once, by anyone, ever.
- **No key rotation performed** — the machinery exists and is tested; no key has
  actually been rotated.
- **No CI restoration.**
- **No heartbeat for jobs that never fire.**
- **No component tests for the admin Founder badge UI** — the admin app has no
  component test setup. The client beneath the UI is tested; the page render and
  two form posts are not. Worth clicking through once (action 4 above).
- **No changes to badge thresholds, contribution amounts, fee calculations,
  debit days or grace periods.** Those are the owner's decisions.
