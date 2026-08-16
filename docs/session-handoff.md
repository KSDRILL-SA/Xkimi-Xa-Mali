# Session Handoff

**Session closed:** 2026-08-16
**Branch state at close:** `main` is the **only** branch. No open pull requests.
**Health at close:** typecheck 3/3 · lint 0 errors · **test 9/9 packages, 1714
passing** · build 3/3 · `npm audit` 0 · **CI green on `main`**.

## What changed most since the last handoff

**CI runs now.** The previous handoff said Actions minutes were exhausted. That
was wrong twice over: the account's **billing was locked** because a stored card
failed authorisation against an empty billing address, and nothing was owed —
both subscriptions are free. Roughly **2 250 runs had ended in `startup_failure`
since at least 29 May**, so no commit in this repository's history had ever been
validated by anything but a developer's machine. Fixed 2026-08-15; the story and
the reasoning failures are in `backup-and-restore.md` §0a.

**The website app is in the test pipeline.** It had no `__tests__` directory and
no `test` script, so `turbo run test` ran eight tasks and skipped it. Every suite
total quoted before 2026-08-16 was two apps out of three.

**What CI found once it could run** — five defects, none introduced by the work
that ran them: a live high-severity `nanoid` advisory; a seed that could not run
on Node 20 while `engines` claims `>=20`; a `turbo.json` declaring no `env`, so
**every cached task ran with a filtered environment**; nine missing workflow
variables; and a build that could not compile without reaching Google for a font
(now self-hosted in `packages/ui/fonts`).

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

**4. ~~The website build needs the network.~~** Fixed — Playfair Display is
self-hosted at `packages/ui/fonts` and loaded through `next/font/local`. The old
note below is kept because the reasoning still applies to any font added later.
All three apps use
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

## 2d. Session of 2026-08-09/10 — the money path, and goal plans

Six PRs, all squash-merged to `main`.

| PR | What was actually wrong |
|---|---|
| #331 | **The worst bug found so far.** `recalculateContributionStatus` announced a status change with `await inngest.send(...)`, and four callers run it inside a Prisma interactive transaction (timeout 5s). With the event key unset the call took ~5.9s, the transaction expired, and the whole write rolled back — *after* `submitManualPayment` had already charged the member. Money gone, no transaction row, and the idempotency key was in the same rolled-back transaction, so the member's retry would have charged them again |
| #332 | Every normal statement ran to two pages with page 2 holding only the notice and signature on an otherwise empty sheet |
| #333 | `/dashboard/contribute` was the only member route with no browser-tab title — it is the only one written as a client component, and a client component cannot export `metadata` |
| #334 | The page called "Make a Payment" could only make one kind of payment. Paying a chosen goal existed in the backend, reachable only from that goal's own page |
| #335 | Goal plans: schema + service |
| #336 | Goal plans: the daily collection job |

**#331 also explains a second symptom.** Badge recalculation is triggered by
`xxm/contribution.status.changed` — the very event that was failing. The test
member's badge had read AMATEUR with every score at 0 since 11 June while they
had three PAID contributions. Running the real recalculation produced SEMI_PRO,
overall 80, 86.7% toward PRO. The logic was always right; nothing was ever
calling it.

### What was verified against the running app, not just tested

- `POST /api/v1/contributions/pay` → 201, contribution PARTIAL 250/400 → PAID 400/400
- R50 to "E2E Fund" → SUCCESS, goal moved to R50, and the older **REVERSED** R500
  stayed excluded — the derived total is still reversal-safe (#237 holds)
- The overfunding warning fired at R2 000 against a goal needing R644
- Statement re-rendered: `Pages: 1`, footer reads "Page 1 of 1"

### Goal plans — where this got to

A member can commit to funding one goal every month: an amount, a day, and the
goal. Collections charge the member's **existing** mandate; there is no mandate
per plan because `findActiveByUser` is singular and the one-active-or-pending
rule enforces it.

**Owner decisions taken this session:** the monthly amount is *suggested*
(remaining ÷ months left) but the member may change it; a failed collection
retries once, then notifies, and the plan stays ACTIVE.

**Shipped:** schema + migration (#335), service, and the daily collection job
(#336).

**Still to build — PR 3 and PR 4 of four:**
1. **PR 3 — enrolment UI.** A "set up a monthly plan" path from the goal page
   and/or Make a Payment. `suggestPlan` already returns `committedMonthly` so
   the screen can show the member's true total commitment, which matters
   because each plan is a separate debit with its own fee.
2. **PR 4 — manage.** List, pause, resume, cancel. `cancelPlan` exists;
   **resume does not** — a PAUSED plan currently has no way back to ACTIVE.
   That is the gap to close first, since the collection job pauses plans on its
   own when a mandate disappears.

There is also **no API route** for any of the plan service functions yet — PR 3
needs those before the UI can call anything.

### The integration pass — and the second money bug it found

Driven as a member against the running app, not asserted in a test runner.

Passed: sign-out; a protected route bouncing to `/login` with `callbackUrl`
intact; sign-in returning to the blocked page; statement download (real PDF,
right content-type and filename); future period, invalid month and all three
admin endpoints refused (403). Cross-endpoint data agreed — insights `ytdPaid`
counts 2026 only, streak 3, on-time 100%, badge SEMI_PRO at 80.

**#339 — found by firing two concurrent goal payments.** `payToGoal` read the
idempotency key, found nothing, and went to the gateway. Two requests that pass
that lookup together both charge, and only the second collides on the unique
index — the member is debited **twice at Netcash** and left with one row and a
500. Live evidence: `statuses [500, 201]`, goal moved once. The row is now
claimed PENDING before the gateway is touched, so the unique index arbitrates:
`[201, 201]`, one charge. Restoring the old order fails four of the five new
tests.

**Same lesson as #331, twice in one session:** a check that runs before the
gateway protects a *sequential* retry and nothing else. Any other money path
that reads-then-charges has this bug. Worth auditing the contribution path the
same way.

**Data to clear before go-live:** the test member's two 2031 contributions are
PAID with `amountPaid` 400 and **zero transactions**. Written straight to the
database — impossible through the app, since `amountPaid` derives from
transactions. They inflate contribution totals against transaction totals.

### Closed in #341 — the fund window, and goal plans finished

**The fund-year finding was half wrong when first written down.** The schema
calls the primary "the one common *yearly* fund", so calendar-year behaviour was
deliberate. The real defect was narrower and had **two** halves: a fund crossing
a year boundary missed the months before its deadline year, *and* counted months
**after** its own deadline. Only the first was noticed originally.

Owner decision taken: the total derives from the fund's own window — the month
it was created through the month it is due. A January-to-December fund produces
exactly the old set, which is what makes it safe for funds already running.
Shown against the real database: a fund opened 2026-06 due 2027-03 gives R400
under the new rule, R0 under the old.

**Goal plans are now complete** (PRs 3 and 4 of the four). API routes exist at
`/api/v1/goal-plans` and `/[id]`; `resumePlan` closes the gap where the
collection job could pause a plan with no way back. Resume accepts only PAUSED
and refuses while the mandate is still missing. Driven end to end through the
real routes, and the collection job driven against a real plan — collected once,
a second run the same day collected nothing, one payment row.

**Test data cleared:** three contributions (not two) marked PAID with money and
zero transactions. `2031-02` at R500 had been missed.

### The autonomous member sweep (#343) — what was probed and what held

An adversarial pass over the whole member API, driven against the running app.

**One defect found and fixed (#343).** The inbox item endpoint answered
`{ read: true }` whatever happened — for a message that did not exist, one
already read, and one belonging to another member. It is **not** an IDOR: the
service filters on `{ id, userId }` and the other member's `readAt` was still
null after probing, which was checked in the database before writing any of this
down. The answer was wrong, not the write. Both operations now report what
happened and answer 404 when nothing of the member's matched — the same answer
for "no such message" as for "not yours", so no existence oracle.

**Everything else held.** Worth recording so the next audit does not repeat it:

- Another member's profile, summary, POPIA export → 403; bank account, goal
  plan, inbox message → 404
- Every admin route as a member → 403
- `PATCH /members/:me` carrying `roles: ['ADMIN']` → 200 but **stripped**; the
  roles column was still MEMBER afterwards. No mass assignment
- Password change refuses without, or with a wrong, current password
- Validation solid across contributions, goals, comments, community messages,
  budgets, mandates, bank accounts and plans
- `createMandate` **does** check bank-account ownership
  (`mandate.service.ts:116`). A probe was refused by the existing-mandate rule
  first, so the ownership check was verified by reading it, not by the probe

**Two traps for anyone auditing this system:**

1. **Rate limiters are no-ops when Redis is unconfigured** — `makeRatelimit`
   returns a shim whose `limit()` always succeeds. A burst test locally proves
   nothing. This is safe: both Upstash vars are `requiredWhenLive`, so a live
   deployment cannot boot without them.
2. **`innerText` races hydration.** A read of the contribute page returned an
   empty body and looked like a regression; the DOM had 6kB of content. Check
   the DOM, or read twice, before calling a page broken.

### Goal plans are complete (#345)

The last piece was the one that mattered: schema, service, routes and the
collection job had all shipped and **a member could not reach any of it**. The
goal page now carries an enrolment card beside "Chip in extra" — amount, day,
the total monthly commitment across every plan, and every state handled (no
mandate, not enrolled, running, paused-with-resume).

A defect found while verifying it: the card returned `null` while loading, so it
was absent from the server-rendered HTML and popped in after hydration, shoving
the page around. It draws a placeholder now.

**Not verified by click-through.** Every node process was killed while clearing
a stuck dev server, which took the Playwright server with it. The card is
verified by compile, by its rendered HTML against the production build, and by
exhaustive testing of the API it calls — but nobody has clicked it. Worth five
minutes with a browser before trusting it in front of members.

### Two environment traps that cost time

- **Never blanket-kill node.** `Stop-Process` across all node processes takes
  the MCP browser server with it and ends browser testing for the session. Scope
  the filter to `*next*dev*`.
- **Turbopack dev can die with `0xc0000142`** (Windows failing to spawn its
  PostCSS worker) and then fail on every request while `next build` and
  `next start` work perfectly. If dev serves 500s on a page you did not touch,
  check whether the build passes before hunting the code — and use
  `npm run start` against the production build to verify pages.

### Final integration state

13/13 member pages render real content · contributions paid R400 = successful
transactions R400 · statement generates as a valid PDF · every guard refuses
(future statement 400, admin 403, other member's export 403, other member's
inbox 404) · 983 tests green.

### The flaky pair — 30 clean runs, and a tool for next time

Hunted properly on 2026-08-10: thirty consecutive full-suite runs of `apps/web`
with nothing else on the machine, detection by exit code, no reproduction. With
the earlier attempts that is roughly forty-six clean runs since the last
sighting.

**It is not fixed and it is not claimed to be.** What changed is that the next
occurrence will be captured rather than lost: `scripts/hunt-flake.sh` runs a
suite until it fails and keeps the whole log of the failing run.

**A hypothesis that did not survive.** `env-netcash` stubs environment
variables, which would leak to any file sharing its worker — except it uses
`vi.stubEnv` and restores with `vi.unstubAllEnvs()` in `afterEach`, and the file
already carries a comment explaining why. Worth recording so the next person
does not spend the same hour on it.

**Three ways this investigation went wrong, all avoidable:**

1. Detection by text match. Grepping for `FAIL` matched *passing* tests whose
   names contain FAILED — this suite tests failure handling, so there are
   several. It reported a catch on run 1 and had caught nothing.
2. Hunting beside a running dev server. The machine ran out of room to spawn
   processes, Turbopack died with `0xc0000142`, and the dev server looked broken
   when it was a casualty.
3. Re-running to "confirm" a sighting. Green tells you nothing you did not
   already know, and the evidence is gone. A flake is caught once.

### Superseded: earlier notes on the flaky pair

Two false starts this session, both worth knowing:

1. A hunt that reported "CAUGHT on run 1" was a **false positive** — the
   detector grepped for `FAIL` and matched *passing* tests whose names contain
   "FAILED".
2. The corrected detector (vitest's exit code) then caught a genuine failure —
   which was a **regression introduced by the fund-window change**, not the
   flake. Fixed, test updated.

Seven clean runs followed before the hunt was stopped. The detector is now
correct; the flake itself remains unexplained. The hunting script is worth
rebuilding as `for i in $(seq 1 20); do npx vitest run --reporter=verbose >
run.log 2>&1; [ $? -ne 0 ] && cp run.log CAUGHT.log && break; done` — **exit
code, never a text match**.

### Both former open findings are closed

- **The minimum goal payment was half fees.** `NETCASH_FEE_BUFFER` is a flat
  R10 and `MIN_GOAL_PAYMENT` was R10, so the smallest permitted payment cost
  R20 to give R10 — and a monthly plan set at the minimum paid that every
  month. Raised to R50, which keeps the worst case at a fifth rather than a
  half, and is deliberately well under the R100 monthly contribution minimum
  because chipping in extra should stay something a member can do with what
  they have.

- **"`payToGoal` has no overfunding cap" was overstated by the note that
  recorded it.** `GoalPaymentSchema` caps a payment at R50 000, so nobody can
  be debited an absurd amount. Capping at the *goal's target* would contradict
  the owner's decision in #334 — warn, and let the member choose — and the
  collection job already trims its last instalment through `instalmentFor`.
  Nothing to fix; the entry was wrong, not the code.

### The flaky suite — one more data point

Recurred once as `env-netcash` + `whatsapp.preferences`, the same pair as
before. Both pass standalone (22/22) and passed on four subsequent full runs, so
it was not captured with output again. Every full suite run since has been
green. See §4.12.

---

## 2a. The member-app pass — all 25 pages audited

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
| Auth pages | `login` `register` `forgot-password` `reset-password` `verify-email` `invite/[token]` | ✅ audited — five clean, one fixed (#324) |
| Public | `/` `about` `privacy` `terms` `support` `offline` | ✅ audited — all clean |

**All 25 pages are through the check phase.** What remains is the admin app and the website.

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

### Closed — the invite page now has a rate limit (#324)

**Fixed in #324.** Kept here because the shape is the one that keeps recurring.
The auth pages were audited and this was the only defect in them; the other five
are 14–38 line shells over the components hardened in #301–#305.

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

**How it was fixed:** the page now runs `authRatelimit` on the request source
before it validates anything, and a throttled request never reaches the service
at all. Same limiter and same key as the route, so the two share one budget
rather than handing a caller two. `InviteErrorView` gained a `SYS_005` state
that names the connection and says nothing about the code that was tried —
somebody working through codes must not learn from that screen whether any of
them was real.

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

## 2b. The statement PDF — now visible, and partly fixed

**The tooling exists now.** `pdftoppm` is installed (winget, `oschwartz10612.Poppler`)
at `%LOCALAPPDATA%/Microsoft/WinGet/Packages/oschwartz10612.Poppler_*/poppler-*/Library/bin/`.
It is not on PATH in this shell — call it by full path. Render with
`pdftoppm -png -r 90 file.pdf out` and read the PNG.

**`npm run seed:statement --workspace=@xxm/database`** writes one past month
that exercises every element at once: a successful debit order, a declined
collection with a reason, a manual payment, and a partial balance so the
outstanding state renders rather than the settled one. Idempotent on the period.

**Five defects were found by rendering it and fixed in #328** — a masthead
collision, table headers reading `OUTSTANDINGSTATUS` and `AMOUNTSTATUS` because
the columns summed to 100% with no padding, a final column holding a date and
labelled `Due`/`Done`, a notice block splitting across the page break, and a
U+2726 decorative mark rendering as a fallback box beside the words "Official
Document". None was visible before because the statement had never been seen
carrying content.

### All three are now closed

This section described the statement before #332 and #338 and was left stale,
which is its own small lesson: a handoff that is not corrected as work lands
sends the next session chasing things that are already done.

- **Page two is mostly empty** — closed by #332. Space was reclaimed from
  chrome rather than from the gaps between content, so a normal month is one
  page.
- **No reference document** — closed in spirit by #338. The Founder Guide was
  taken as the standard: its ivory ground, display serif, gold bound edge, and
  the Foundation's real mark in place of the placeholder letter X.
- **The empty-period case** — closed here, and it was hiding something worse
  than whitespace. It renders on one page now, but it also said ACCOUNT
  SETTLED, PERIOD STATUS PAID and "fully settled" for a month in which nothing
  was ever billed. `outstanding <= 0` is true both when a member has paid what
  they owed and when they owed nothing, and the document could not tell the two
  apart. A statement of account claiming a member paid something they were
  never billed for is the kind of thing somebody could reasonably show as
  proof. It now reads NO ACTIVITY THIS PERIOD, NONE DUE, and "nothing was due".

## 2c. Fixed from a live report — the pending mandate dead end

A member who had just set up a mandate was told to set one up. The contribute
page recognised only `ACTIVE`; a new mandate is `PENDING` until the bank
authorises the DebiCheck instruction. So the page said "No active mandate — Set
up mandate" and sent them to a page where creating a second is refused by the
one-active-or-pending rule. Fixed in #328: none and pending are now distinct
states.

**The lesson is the method, not the bug.** Ten pages of code review did not find
this. One member using the app found it in a minute. Every remaining area should
get a pass with the app actually running.



The owner opened a generated statement and judged it not good enough. That
judgement stands. What follows is what is actually known, so the redesign does
not start by guessing.

**The statement that was judged was empty.** The member's only contribution
periods are 1/2031 and 3/2031, and the statement API refuses a future period, so
the one generated was June 2026 — a month with no data. It rendered `R 0.00` in
every total, "No contributions recorded for this period", "No transactions
recorded for this period", and still ran to two pages. **Nobody has yet seen this
design carrying real content.** That is the first thing to fix about the process,
before a single style is changed.

**What text extraction did show** (`pdftotext -layout` works here; `pdftoppm`
does not, so pages cannot be rendered to images yet):

- **An empty statement still runs to two pages.** Page two is the notice and
  terms block. On a statement with nothing in it that is mostly whitespace.
- **"AUTHORISED BY" renders with nothing beneath it** when no admin signature is
  configured. On a real document a blank authorisation block reads as unfinished
  rather than as pending.
- The banking row showed `Std` / `unavailable` — the first is bad seed data, the
  second is the H-5 degrade path working correctly.

**What is not wrong, checked so it is not "fixed" into a regression:**
`localhost:3001` in the page footer is `SITE_HOST`, derived from
`NEXT_PUBLIC_SITE_URL` on purpose so a statement can never carry a domain the
Foundation no longer owns. In production it is the real domain.

### How to pick this up

1. **Make it visible.** `pdftoppm` is not installed (`winget install poppler`, or
   equivalent). Without it the PDF cannot be looked at, only read as text — and a
   document design cannot be judged from its text.
2. **Seed one realistic period**: a debit order, a manual payment, a declined
   collection and a partial balance, so the tables, the status pills and the
   totals are all exercised at once. A script that writes a sample PDF straight
   to a file will iterate in seconds where a browser session takes minutes.
3. **Get a reference.** "World class" needs something to be measured against —
   ask the owner for a statement they rate. Building to a named standard beats
   building to a guess.

The template is `apps/web/lib/pdf/statement.tsx` (479 lines) over
`apps/web/lib/pdf/kit.tsx`, which holds the shared masthead, footer, status pills
and palette. `contribution-report.tsx` uses the same kit, so kit changes reach
both documents.

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
| ~~CI still not executing~~ | — | **Resolved 2026-08-15.** Green on `main`. Was a billing lock, not exhausted minutes |
| **Netcash not yet applied for** | The first collection | Known and expected — the merchant application has not been submitted |

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
| 9 | ~~Restore CI (H-3)~~ | — | **Done 2026-08-15.** Green on `main` |
| 11 | Set `BACKUP_AGE_PUBLIC_KEY` + `PRODUCTION_DIRECT_DATABASE_URL`, then the first real backup runs | 15 min | Owner (keypair) + a production DB |
| 12 | Production restore drill (`backup-and-restore.md` §8). Development was drilled 2026-08-15 | Half a day | Action 11 |
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
