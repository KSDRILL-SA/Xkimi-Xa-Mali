# Session Handoff

**Session closed:** 2026-08-09 (second sitting — the member-app pass)
**Branch state at close:** `main` is the **only** branch. No open pull requests.
**Health at close:** typecheck 0 · lint 0 errors (5 warnings, all pre-existing
files) · test 0 — **1258 passing** (was 1039) · build 0 (3/3) · `npm audit` 0.

Everything below was verified locally. **CI is still not executing** — GitHub
Actions minutes are exhausted on the free tier. Nothing automated is checking
this repository.

> The previous handoff (2026-08-08) is preserved in git history at `f8ff61b`.

---

## 1. Start here — the five things that will bite you first

**1. `main` is the only branch.** Cut feature branches from `main`,
`gh pr create --base main`, squash-merge, delete. CI triggers on `main` only.
**Do not recreate `Dev`.**

**2. Run `npm run db:generate` immediately after any branch switch.** The
generated Prisma client lives in the repository-root `node_modules` and is *not*
per-branch. The signature is **a green `typecheck` and a red `next build` on the
same tree**. Recorded as §4.11 in `ENGINEERING_WORKFLOW.md`.

**3. `rm -rf apps/*/.next` after a branch switch too.** Next's generated
`.next/types/validator.ts` still imports routes from the other branch.

**4. The website build needs the network.** All three apps use
`next/font/google`. A DNS blip fails the build with `next/font: error:` and
nothing is wrong with the code — re-run.

**5. A test file that calls `vi.doMock` must undo it.** New this session, and it
is §4.12 in a second costume — see §5 below. `doMock` is not scoped to the file
that made it.

---

## 2. What was done

Seven PRs, all squash-merged to `main`.

| PR | What was actually wrong |
|---|---|
| #300 | Every alert in the system was raised *by* a job that ran, so a job that never fired at all raised nothing. No error, no failed row — indistinguishable from a quiet month, and on debit night it is every member uncollected |
| #301 | Sign-in had no rate limiting of any kind, in either app. The per-account lockout is per *account*, so one password against fifty addresses never tripped it, and it never fired at all for an address with no row |
| #302 | Registration enforced 8 characters while every other password path required 12 — so every password in the system was set under the weaker rule, and the stricter one only ever governed replacing them |
| #303 | Account status was disclosed *before* the password was checked, so any string submitted against an address revealed whether it is registered and what it is doing. On the console it also confirmed the address holds ADMIN |
| #304 | The admin console had no CSRF origin check at all. Also: two feature flags that could not be turned off, an invite acceptance protected only by an unrelated unique constraint, and a forgot-password timing channel |
| #305 | A failed verification email ended the account — row exists so the address is taken, invitation spent, status PENDING so sign-in is refused, token gone with the message, and no way to ask for another |
| #306 | `setMemberRole` existed twice and the console called the copy with no guards, so the sole admin could remove his own admin role and leave the system with none |

---

## 2a. The member-app pass — in progress, 14 of 25 pages

**The method, agreed with the owner:** one page at a time, all five tasks on
each (check → fix → harden → tighten → improve), each page its own PR with
tests and all four gates. A page means the page, its components, its API
routes, its services and the queries underneath — never just `page.tsx`.

**Do not change the method to "audit the whole app for pattern X".** Four
separate times a defect was fixed on one page and found again, unlooked-for, on
a later one. The same words in a different file are a different bug until
somebody reads them.

| Group | Pages | State |
|---|---|---|
| Money path | `mandates` `contribute` `contributions` `transactions` `statements` | ✅ #307–#312 |
| Core member | `dashboard` `profile` `notifications` `goals` `goals/[id]` | ✅ #313–#317 |
| Social | `badges` ✅ #319 · `community` ✅ (clean, no PR) · **`invitations`** · `whatsapp` | 2 of 4 |
| Auth pages | `login` `register` `forgot-password` `reset-password` `verify-email` `invite/[token]` | audited — five clean, **one open finding**, see below |
| Public | `/` `about` `privacy` `terms` `support` `offline` | ✅ audited — all clean |

**Next: the open invite finding below, then the five public pages.**

### The four shapes that kept recurring

1. **A row spread into a client component.** Everything a client component
   receives is serialised into the RSC payload and readable in page source.
   `mandates` shipped `netcashMandateId`; `contributions` shipped the **raw
   Netcash SOAP XML** stored in `gatewayResponse`. TypeScript's structural
   typing accepts an object carrying more than the consumer declares, so
   nothing complains. **Name the fields; never spread.**
2. **The gateway's three answers collapsed onto two.** `§4.6` records three
   copies. Two more were found here — `submitManualPayment` (#308) and
   `payToGoal` (#317). Everything must import `toTransactionStatus`.
3. **`randomUUID()` inside an idempotency key**, making the column and its
   unique index decorative. Found in the manual contribution path (#309) and
   the goal payment path (#317). Both now take a client-supplied token and check
   **before** calling the gateway, never after.
4. **`Math.max(1, Number(x))` is `NaN` when `x` is not a number**, and reaches
   Prisma as `skip: NaN`. Three pages had it.

### What is worth knowing before touching these pages again

- **`/api/v1/health` reports `checks.jobs` and a count, never the job names.**
  It is public and unauthenticated.
- **Member statements are streamed through the route, never uploaded.** The
  uploader was deleted; see §4.5a for the two remaining public-blob uses.
- **`SectionBoundary` rethrows anything with a `NEXT_REDIRECT` digest.** Next
  signals navigation by throwing, so an error boundary that catches everything
  swallows redirects. Dashboard sections therefore guard by returning `null`.
- **`MANDATORY_SLUGS` is exported and asserted in both directions.** Adding or
  removing one is a decision about whether a member can end up not knowing
  their money stopped.
- **No member page may assert `session!`** — a test sweeps `app/(member)` for it.

### Open finding, fully specified — the invite page has no rate limit

**Pick this up first.** The auth pages were audited and this is the only defect
in them; the other five are 14–38 line shells over the components hardened in
#301–#305 and have nothing in them.

| Path | Calls | Limiter |
|---|---|---|
| `POST /api/v1/auth/invitations/validate` | `validateInviteCode` | ✅ `authRatelimit`, 5/min |
| `GET /invite/[token]` | `validateInviteCode` | ❌ **none** |

`middleware.ts` waves `/invite/` through as a public page, so the page is an
unthrottled oracle for the same check the API route throttles. That is the §9
asymmetry — two paths to one check, one hardened — for the fifth time in this
pass.

Codes are 40 bits (`randomBytes(5)`), so brute-forcing is not practical. The
finding is the asymmetry, not an imminent break-in.

**Why it was not fixed in the sitting that found it:** a page render cannot
return a 429, so this needs a limiter check in
`app/(auth)/invite/[token]/page.tsx`, a new "too many attempts" state on
`InviteErrorView`, tests, and the four gates. That was more than the remaining
context allowed, and a half-finished change to an auth path is worse than a
precise description of one.

**Note, not a defect:** the code sits in the URL *path*, so it lands in Vercel
access logs. The invite email already puts it in a URL (`/register?code=…`), so
this is the established design rather than a regression.

### Checked and already correct — `SUPPORT_EMAIL` on a live deploy

Raised during the public-pages audit and **found to be a false alarm**, recorded
so it is not raised again or "fixed" into a regression.

The privacy policy routes POPIA rights requests to the Support page, which
renders `mailto:${env.SUPPORT_EMAIL}`. The concern was that an unset variable
would leave that pointing at the `support@example.invalid` placeholder — a dead
address for a statutory right.

It does not. `configuredWhenLive` reads:

```ts
(LIVE ? schema : schema.default(devPlaceholder))
```

When live there is **no default**, so `SUPPORT_EMAIL` is required and the app
refuses to boot without it. The placeholder applies in development only. The
protection asked for already exists.

**Do not change this to `requiredWhenLive`.** That helper returns
`schema.optional()` off a live deploy, which would make the type
`string | undefined` and render `mailto:undefined` locally — strictly worse than
what is there.

The address itself is `xkimxamali@gmail.com`, the one mailbox used for
everything that *receives* — `SUPPORT_EMAIL`, `ALERT_FALLBACK_EMAIL` and
`NEXT_PUBLIC_SUPPORT_EMAIL`. It still cannot be `RESEND_FROM_EMAIL`; see §4.3.

### `community` was audited and found clean

No PR. No `dangerouslySetInnerHTML` anywhere; edit is owner-only and delete is
owner-or-admin; admins deliberately cannot rewrite a member's words; content is
bounded in the service on both paths; the member directory carries no email or
phone. Recorded so it is not re-audited.

The one judgement call left open: community posting uses the generic
`apiRatelimit` (60/min) rather than a dedicated bucket, where goal proposals get
3/hour and admin broadcasts 5/hour. Defensible either way on a 50-member wall
with no notification fan-out. Not treated as a defect.

## 3. Decisions the owner took — do not re-litigate these

| Question | Decision |
|---|---|
| Branching | `main` only. `Dev` deleted 2026-08-08 |
| How many admins? | **One** — the owner. The other three founders are plain `MEMBER`s |
| Founder badge storage | A `MemberDistinction` record — not a boolean, not a fifth `BadgeTier` |
| Is it revocable? | **Permanent**, survives `RESIGNED`. Removal exists only as an *erratum*, and demands a reason |
| Can an admin self-grant? | **Yes** — with one admin who is himself a founder there is no alternative |
| How many founders? | **Four**, enforced by `FOUNDER_COUNT` |
| Password policy | **12 characters, no composition rules.** Existing accounts forced to reset — **but gated behind a flag**, see §4.1 |
| Login error messages | Check the password **first**, then disclose status. A correct password still gets the exact reason; a guesser learns nothing |

---

## 4. Outstanding

### 4.1 `REQUIRE_PASSWORD_POLICY_RESET` is still OFF

**This is the one thing built and waiting on a decision.** Nothing is enforced
until you set it, and setting it is deliberately not a consequence of deploying.

Registration already enforces 12 characters for **new** accounts, from #302. The
flag governs **existing** accounts — every one of which has
`passwordChangedAt IS NULL`, meaning a password set under the old 8-character
rule. Turning it on refuses their sign-in until they reset, **including yours**.

Before you turn it on, in this order:

1. **Tell the founders.** They will be signed out with no warning otherwise.
2. **Confirm a reset email actually arrives** — send yourself one from
   `/forgot-password` and watch it land.
3. **Then** set `REQUIRE_PASSWORD_POLICY_RESET=true` in **both** the member and
   admin Vercel projects, and redeploy.

> **The app refuses to enforce it without working email**, and logs at error
> level on every attempt when it cannot. That is deliberate: the way out of the
> requirement is an email, and enforcing it without one locks out every account
> including the only admin, with the console you would fix it from behind the
> same door. The admin app has no email config of its own — set `RESEND_API_KEY`
> and `RESEND_FROM_EMAIL` there too, or it will never enforce.

Full procedure and a per-account SQL escape hatch: `docs/runbook.md` →
"Requiring everyone to replace an old password".

### 4.2 The Netcash dry run — still the only real engineering gap

Unchanged. **The adapter has never spoken to a live Netcash account.** It is
built against the vendor's published contract (live WSDL + XSD) and covered by
21 contract tests. **A contract test is not a settlement.**

1. Obtain the Netcash account and its **debit order service key**.
2. Set `NETCASH_DEBICHECK_TEMPLATE_ID` — **required when live; the app refuses to
   boot without it.**
3. Call `checkServiceKey()` (`apps/web/lib/netcash.ts`) — read-only and cheap.
4. Run **one** member through **one** full cycle in test mode before anyone else.

**An ISV agreement is not required.**

### 4.3 The Foundation's mailbox

The operational address is **`xkimxamali@gmail.com`**. It lives in the
environment, never in code:

| Variable | App | Set locally? |
|---|---|---|
| `SUPPORT_EMAIL` | web | ✅ |
| `ALERT_FALLBACK_EMAIL` | web | ✅ |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | website | ✅ |

All three still need setting **in Vercel** for each environment. The public one
is inlined at build time, so setting it after a deploy does nothing.

> **It cannot be `RESEND_FROM_EMAIL`.** Resend only sends from a domain you have
> verified and nobody can verify `gmail.com`. That must be `noreply@<your-domain>`
> once the domain is registered. A live build refuses to start on one.

**Set `ALERT_FALLBACK_EMAIL` before going live.** With a single admin, every
other alert channel depends on one account being active, one phone being
reachable, and the notification worker being alive. This is a standing address
that receives every **critical** alert, needs no account, and is sent directly
rather than queued. Unset today.

### 4.4 Deploy prerequisites — migrations

**Two new migrations this session**, both additive, both applied and verified
locally (`prisma migrate status`: "Database schema is up to date!"):

```
20260808140000_job_heartbeats      -- job_heartbeats table, seeded for watched jobs
20260808150000_password_changed_at -- users.passwordChangedAt, nullable, not backfilled
```

**40 migrations total.**

Run migrations with:
```
cd packages/database && node --env-file-if-exists=../../apps/web/.env.local \
  ../../node_modules/prisma/build/index.js migrate deploy
```
`npm run db:migrate` is `migrate dev`, which prompts and needs shadow-database
permissions the local user does not have.

### 4.5 Point an uptime monitor at `/api/v1/health`

**The only thing that catches Inngest stopping altogether.** The heartbeat check
added in #300 is itself a cron, so it cannot detect its own absence — if
scheduling stops entirely, the watcher stops with everything else and nothing
inside this system says so.

`/api/v1/health` reports `checks.jobs` (`ok` / `stale` / `unknown`) plus a
count, over HTTP, which is a different failure domain. Point Better Stack at it
with a body assertion on `"jobs":"ok"`. Fifteen minutes, needs a deploy.

### 4.5a Public blob uploads — carried forward to the admin console

Member statements were uploaded to Vercel Blob with `access: 'public'` and
`addRandomSuffix: false`, at `statements/<userId>/<year>-<month>.pdf`. The URL
was unauthenticated, permanent, and fully derivable from a member id. Fixed in
#312 by streaming through the route and deleting the uploader.

**The same pattern is still live in two other places**, deliberately left until
the admin console is audited:

- **Admin signatures** (`apps/admin/lib/signature-storage.ts`)
- **Goal outcome media** (`apps/admin/lib/outcome-storage.ts`)

`access: 'public'` is the storage adapter's **default** (`options.access ?? 'public'`
in `vercel-blob.adapter.ts`), so anything uploaded without an explicit choice is
world-readable by URL. An admin's signature image at a guessable public URL is
the same class of problem as the statement was, and is the one to look at first
when that area comes up.

### 4.6 Staging has no branch

`docs/environment-setup-plan.md` mapped `Dev` → staging. With `Dev` gone,
**staging needs its own long-lived `staging` branch off `main`**, created when
that environment is stood up. Until then, per-PR previews are the only
non-production environment — enough to review a change, **not** enough to
rehearse a debit cycle.

### 4.7 Still open from before

- **CI restoration (H-3)** — the workflow is correct and not running. Blocked on
  a billing decision.
- **The Founder Guide PDF** — GitHub still serves the pre-rewrite commit
  `d3ddd74` and blob `3bf2752348503a60bae2e1039cc7835d85ff8446` by direct SHA.
  Only the repository owner can open the GitHub Support request to purge it.
- **`RESIGNED` members keep the ability to sign in** — this codebase's reading of
  "leave at any time, with your history intact". An interpretation, not a
  quotation. One line in `apps/web/lib/auth.ts` if the founders disagree.
- **No component tests for the admin app.** It has no component test setup at
  all. The Founder badge UI and the role controls are tested at the service
  layer; the pages and their form posts are not.

---

## 5. What is worth knowing about the new code

### Job heartbeats (#300)

Five money-critical jobs write `job_heartbeats` as their **last** step, and
`job-heartbeat-check` (cron `*/15`) raises **`SCHEDULED_JOB_SILENT`** when a beat
is overdue. Windows and the response procedure: `docs/runbook.md` → "A job that
never fired".

- **`SCHEDULED_JOB_SILENT` is deliberately not `SCHEDULED_JOB_FAILED`.** A failed
  job has a run in the dashboard with a stack trace; a silent one has nothing to
  open, and the question is whether the app is registered at all.
- **A missing heartbeat row is overdue, not fine** — C-2 in a new place. The
  migration seeds a row per watched job so a fresh deploy gets one full window.
- **The beat means the run reached the end, not that it went well.** A debit run
  that declined every mandate still beats.
- **`recordJobHeartbeat` never throws** — it is called after money has moved.
  **The consequence for tests:** a suite mocking `@/lib/db` without
  `jobHeartbeat` passes green while the heartbeat is never written.
- `mandate-delay-handler` is **not** watched — it is event-triggered.

### Auth (#301–#305)

- **Sign-in is throttled per source**, 10/5min member, 5/5min admin. Keyed on IP
  and *not* on the account, deliberately: an account-keyed limit would hand
  anyone a way to hold the single admin out of his own console.
- **Nothing is disclosed before the password is checked.** `ACCOUNT_LOCKED`,
  `ACCOUNT_SUSPENDED`, `PENDING_ACTIVATION`, `EMAIL_NOT_VERIFIED` and
  `PASSWORD_RESET_REQUIRED` all sit below `bcrypt.compare`. The cost is that
  bcrypt now runs for locked and suspended accounts — that is the price of the
  reordering, bounded by the throttle, not an oversight.
- **A wrong guess against an already-locked account does not extend the lock.**
- **Password reset clears the lockout.** It is the only self-service way out,
  which matters most for the account with nobody above it.
- **`verifyEmail` no longer decides status** — it promotes `PENDING` only, via
  `updateMany` with the status in the predicate.
- **The verification link can be reissued** at `/api/v1/auth/resend-verification`,
  offered on the sign-in page once `EMAIL_NOT_VERIFIED` comes back — which means
  the password was right, so it cannot be used to mail a stranger.
- **`booleanFlag`, never `z.coerce.boolean()`.** That is `Boolean(string)`, so
  `"false"` parses as **true**. Two flags had been unswitchable since they were
  added.

### Roles (#306)

**`setMemberRole` existed twice and the console called the copy with no guards.**
The sole admin could remove his own admin role: session ended by the roleVersion
bump, sign-in refused for want of the role, nothing able to grant it back, and
the system left with no admin at all.

- Both apps now import `refuseRoleChange` from `@xxm/utils/role-policy`. **A test
  asserts neither restates the threshold locally** — two implementations that
  agree today is exactly how this happened.
- **Self-revocation is refused even when other admins exist.** Another admin can
  always do it, and requiring that means every revocation leaves somebody able
  to reverse it.
- **An unusable admin count refuses** rather than reading as "plenty of admins".
- **`MEMBER` cannot be revoked, because it is not a permission.** Nothing checks
  for it; every member-facing service gates on `assertCanAccess`, which permits
  self-access whatever roles are held. Suspension is what ends access.
- Audit actions unified on `ADMIN_ROLE_REVOKED`. The console previously wrote
  `ADMIN_ROLE_REMOVED`, so any query on the member app's name missed every
  revocation the console performed.

### Never leave a `vi.doMock` behind (§4.12, second costume)

`gateway-selection` failed alongside `health.route` in roughly one full run in
six — passing standalone, passing on re-run. `vi.doMock` is **not scoped to the
file that made it**, so the mocks of `@/lib/db` and `@/lib/redis` reached
whatever ran next in that worker.

**A file that calls `vi.doMock` must undo it** in an `afterEach`, with
`vi.doUnmock` plus `vi.resetModules`. The `no-restricted-syntax` rule added for
`process.env` does not catch this, and nothing yet does.

### Still true from before

- **The encryption keyring**: ciphertext is `v1.<keyId>.<base64(iv ‖ tag ‖ ct)>`;
  unversioned legacy values are read by trying every key. **Do not "clean up"
  that path.** A new encrypted column must be added to
  `packages/database/scripts/reencrypt-secrets.ts` or a rotation reports success
  while leaving it behind.
- **`badge.service.ts` must never read `MemberDistinction`.** A test asserts the
  source file does not contain the word "distinction".
- **A template change in code does not reach a database that already has the
  slug.** `prisma/seed.ts` upserts with `update: {}`.
- **Never assign to `process.env` in a test** — use `vi.stubEnv`.

---

## 6. Risks

| Risk | Who it affects | How you would notice |
|---|---|---|
| **`REQUIRE_PASSWORD_POLICY_RESET` turned on before a reset email is proven to work** | Everyone, including the only admin | The app refuses to enforce and logs it, so the *failure* is safe — but if email works and the founders were not told, they are simply locked out until they reset |
| **`ALERT_FALLBACK_EMAIL` unset on a live deploy** | Everyone, silently | Nothing. That is the point |
| **`NETCASH_DEBICHECK_TEMPLATE_ID` unset on a live deploy** | Everyone — the app will not boot | Deploy fails at env validation |
| **Netcash adapter never exercised live** | Every member, on the first collection | A batch rejected wholesale. Mitigate by running one member first |
| **Inngest stops scheduling entirely** | Everyone, on the next debit day | Nothing inside this system says so. Only an external monitor on `/api/v1/health` catches it — **not configured** |
| **Migrations not run before deploy** | Everyone | Prisma errors on any query touching the new tables |
| **A key removed from `ENCRYPTION_PREVIOUS_KEYS` too early** | Every member with a bank account | `secrets:reencrypt` exits non-zero. **Do not proceed past that** |
| **CI still not executing** | Everyone | Nothing automated is checking this repository |

---

## 7. Recommended next actions, in order

| # | Action | Effort | Blocked on |
|---|---|---|---|
| 1 | Apply to Netcash; obtain account, service key and mandate template id | Days–weeks | External |
| 2 | Set the live env vars (**including `ALERT_FALLBACK_EMAIL`**), run `migrate deploy`, call `checkServiceKey()` | 1 hour | Action 1 |
| 3 | One member, one full debit cycle in test mode, end to end | Half a day | Action 2 |
| 4 | Point the uptime monitor at `/api/v1/health` with a `"jobs":"ok"` body assertion | 15 min | A deploy |
| 5 | Tell the founders, verify a reset email lands, then turn on `REQUIRE_PASSWORD_POLICY_RESET` | 30 min | Owner |
| 6 | Click through the Founder badge and role flows once on a real deploy | 30 min | A deploy |
| 7 | Create the `staging` branch and stand that environment up | Half a day | Owner |
| 8 | Confirm the `RESIGNED` sign-in interpretation with the founders | Minutes | Founders |
| 9 | Restore CI (H-3) | Half a day | Billing decision |
| 10 | GitHub Support request to purge the Founder Guide PDF blob | 15 min | Owner only |

---

## 8. What was explicitly not done

- **No live Netcash call.** Not once, by anyone, ever.
- **No key rotation performed** — the machinery exists and is tested.
- **No CI restoration.**
- **`REQUIRE_PASSWORD_POLICY_RESET` was not turned on.** Built, tested, inert.
  Nothing has signed anybody out.
- **No external ping configured.** The heartbeat check cannot catch its own
  absence and only a monitor outside this system can.
- **No component tests for the admin app** — it has no component test setup.
- **No enforcement of `MEMBER` as a permission.** It is now refused as a
  revocable role rather than made meaningful. Making it meaningful would mean a
  check in every member-facing service, which is a larger change than the
  problem warranted.
- **The invite page has no rate limit** while the API route doing the same check
  does. Fully specified in §2a, and the first thing to pick up.
- **The member-app pass is 14 of 25 pages done.** See §2a for the scoreboard,
  the method, and the four recurring shapes. `invitations` is next.
- **The flaky suite is not fixed.** It recurred after the `doUnmock` fix as a
  different pair. §4.12 records the six mechanisms eliminated and the one
  question left — and the fact that the assertion text was never captured on
  either occurrence, which is what would decide it. Capture the whole log next
  time before grepping it.
- **The areas not yet audited:** mandates and the money path, contributions and
  goals, notifications, reporting, and the admin console's own surfaces beyond
  roles. Auth and roles were done in full this session; nothing else was.
- **No changes to badge thresholds, contribution amounts, fee calculations,
  debit days or grace periods.** Those are the owner's decisions.
