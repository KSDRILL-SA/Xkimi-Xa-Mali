# Production Readiness Tracker

This directory turns three documents the owner brought in on 2026-08-29 into a
living checklist. The source documents make claims — some already verified in
this codebase's own history, most not yet checked against this specific
system. **The purpose of this tracker is to convert every claim and every
test case into one row with a status**, so nothing is marked done from a
document's say-so alone, and nothing gets silently forgotten either.

## The three source documents

| # | File | Source document | Scope |
|---|---|---|---|
| 1 | [`01-financial-integration-test-plan.md`](./01-financial-integration-test-plan.md) | *Financial Integration & Production Readiness Test Plan* | 20 sections, ~140 individual test cases covering duplicates, failures, reversals, reconciliation, auth, roles, transaction state, audit logs, notifications, statements, both directions of provider/app failure, webhooks, DB integrity, concurrency, API recovery, security, end-to-end, disaster recovery, and the go-live checklist |
| 2 | [`02-platform-architecture-audit.md`](./02-platform-architecture-audit.md) | *Platform & Architecture Audit Report*, dated 28 Aug 2026 | Infrastructure/deployment findings — domain, DNS, two named git branches, a security hotfix, missing env vars, error tracking, plus its own production-readiness checklist |
| 3 | [`03-notification-delivery-recovery.md`](./03-notification-delivery-recovery.md) | *Addendum — Notification Delivery & Recovery Testing* (§21) | A live incident (200 notifications permanently failed — 101 email, 99 SMS) plus the general test plan for notification delivery, retry, and recovery |

## Status legend

Every row carries one of these. Don't invent new ones — if none fit, that's a
sign the row needs splitting.

| Status | Meaning |
|---|---|
| `NOT STARTED` | Not yet looked at |
| `IN PROGRESS` | Being actively worked |
| `PASSED` | Verified working, with evidence (PR #, commit, test file, or a direct check) linked in the Evidence column |
| `FAILED` | Verified broken — a real defect, with evidence |
| `NEEDS FIX` | Known broken, fix identified but not yet shipped |
| `BLOCKED` | Can't proceed — usually waiting on an external party (Netcash, NASASA, the registrar) or an owner decision |
| `MOOT` | The finding no longer applies (e.g. a branch that was checked and doesn't exist) — still recorded, not deleted, so nobody re-raises it from a stale document |

**A row only becomes `PASSED` from a real check performed in this repo or
against a running deployment** — never from the source document simply
asserting it. Several of the source document's own claims are hedged
("*reportedly* patched", "*reportedly* missing") — that word is the tell that
*it* hadn't verified them either.

## How to use this while working

1. Pick a row (or a whole section) to work.
2. Set it `IN PROGRESS`.
3. Do the actual check or fix.
4. Set it `PASSED`/`FAILED`/`NEEDS FIX`/`MOOT`, and fill in **Evidence** —
   a PR number, a file:line, a command and its real output, a screenshot
   reference. Write the date.
5. If a fix was needed, link the PR once it merges.
6. Update the dashboard counts below.

## Dashboard

*(hand-updated — refresh the counts here whenever a batch of rows changes
status; a row counted under `IN PROGRESS` below is not double-counted
elsewhere, and doc 2's §11 deliberately reproduces some doc 2 rows verbatim
as the source audit's own checklist, so its total is not simply "one row per
finding")*

| Document | Passed | Needs fix / Failed | Blocked | Moot | In progress | Not started |
|---|---:|---:|---:|---:|---:|---:|
| 1. Financial integration test plan | 78 | 0 | 41 | 0 | 7 | 71 |
| 2. Platform & architecture audit | 41 | 3 | 6 | 5 | 5 | 28 |
| 3. Notification delivery & recovery | 45 | 0 | 13 | 0 | 2 | 34 |

*Counts as of 2026-08-29, second pass — the owner separately dropped the 3
source `.md` files at the repo root and asked for a verification pass. That
pass found document 1 had several places where a source document's list of
distinct items (e.g. §6's role/operation table, §8's 6-field audit
checklist, §9's notification-trigger test cases, §11/§13's multi-step
scenarios) had been collapsed into a single tracker row instead of one row
per item — same conclusion, but real items that weren't individually
trackable. Fixed: those sections now carry one row per source item, same as
everywhere else in the tracker. Documents 2 and 3 were checked the same way
and found already complete on the first pass, with one deliberately-collapsed
row in document 3 (§21.6) expanded for consistency.

A `PASSED` count this high on first
touch is because a great deal of this codebase's prior audit/hardening work
(auth/roles #300–#306, the money-path pass #307–#345, the autonomous member
sweep #343, the statement rendering fixes #328/#332/#338) already exercised
many of these exact test cases — this tracker's job on first pass was mostly
to **find and cite that existing evidence**, not to invent new confidence.
Genuinely new testing work starts from the `NOT STARTED` and `IN PROGRESS`
rows. `BLOCKED` rows (mostly document 1, all needing a live Netcash account,
plus the BulkSMS-dependent rows in documents 2 and 3) cannot move without an
external dependency landing first — don't spend engineering time on them.*

## What's already known, going in

Cross-referencing against this repo's own history **before** treating
anything in the three documents as fact:

- **Section 2's password-in-URL security hotfix is real and already
  fixed** — PR #411, "password forms had no `method=\"post\"` fallback".
  Found and closed in a documented session, not just claimed.
- **`RESEND_API_KEY` is no longer missing** — set in `xkimi-xa-mali-web`
  production 2026-08-28/29, domain verified in Resend as of this session.
  Was missing when the audit was written; isn't now.
- **Sentry error tracking is no longer missing** — done in the same
  deployment session as the domain work (`project-deployment-phase`
  memory), DSNs configured for both `web` and `admin`.
- **`BULKSMS_USERNAME`/`BULKSMS_PASSWORD` are no longer missing** — owner
  created a real BulkSMS account 2026-08-29, credentials configured in
  Vercel. A second bug was found underneath once credentials worked (the
  20-char `userSuppliedId` limit vs. this system's 25-char cuids) and fixed
  in code — see document 2 §6.e. **That fix, and every other fix from this
  session, is sitting uncommitted on `main` — not deployed yet.** Full SMS
  backlog recovery is also gated on a BulkSMS credit top-up (account
  currently has 5 credits).
- **Both named branches (`perf/website-performance`,
  `feat/phase-10-performance`) do not exist in the repository, in any
  form, checked directly** (`git branch -r`, `gh pr list --search`, `git log
  --all --grep`). `perf/website-performance` was PR #114, merged to `main`
  2026-06-09 — three months before the audit — normal branch cleanup after
  merge deleted it. `feat/phase-10-performance` has no trace anywhere: no
  PR, no commit, no branch, live or deleted. Marked `MOOT`, not `FAILED` —
  there's nothing here to fix, but also nothing to confirm was ever really
  broken; the audit document may have been describing something that never
  reached this repository, or that was already resolved before it was
  written.
- **The registrar physical-address / `clientHold` risk in §2.2 looks
  real and still open.** [[project-deployment-phase]] independently
  recorded the domain's WHOIS "Company" field showing "North West
  University" (not KSDRILL SA) with an "Update Pending" badge — found
  before this document was ever seen, from a completely different angle.
  Two independent observations landing on the same domain-verification gap
  is a reason to treat this as **real and urgent**, not a document artifact.
  Tracked in document 2, §2.2 — **this is the single highest-priority open
  item across all three documents.**

See [[project-deployment-phase]], [[project-mobile-relaunch-and-account-reset]],
[[project-netcash-critical-path]] for the underlying session history any of
these rows link back to.

## Session close, 2026-08-29 night

- **Netcash registration form submitted.** Reviewed section-by-section
  before the owner clicked submit (2 real errors caught and fixed: a
  postal-address city typo, and the bank dropdown stuck on "Other" instead
  of "Capitec Business"). Netcash confirmed receipt by email same day.
  Vetting is now entirely on their side — nothing left to do here.
- **3 of the 7 go-live env vars are now set and live** on `xkimi-xa-mali-web`
  (`NEXTAUTH_URL`, `ADMIN_WHATSAPP_NUMBER`, `SUPPORT_EMAIL`) — see document 2
  §12. The remaining 4 are Netcash-issued and can't be filled until their
  onboarding completes.
- **Role separation and member-to-member data isolation explicitly
  re-verified** at the owner's direct request, against current code (not
  re-cited from memory) — document 1 §6 now has two new rows covering
  authentication-level cross-role login attempts specifically, on top of
  the authorization-level checks already there.
- **A full system integration sweep found everything healthy**: all 3 apps'
  health endpoints, deployment status, CI, and Sentry all checked clean;
  see document 2's "Final integration sweep" note for the detail.
