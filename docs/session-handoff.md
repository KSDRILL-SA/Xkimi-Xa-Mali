# Session Handoff

**Session closed:** 2026-08-07
**Branch state at close:** `main` and `Dev` hold **identical trees**; no other
branches exist; no open pull requests.
**Health at close:** typecheck 0 · lint 0 errors (5 warnings, all pre-existing
files) · test 0 — **941 passing** (was 840) · build 0 (3/3) · `npm audit` 0.

This document follows `ENGINEERING_WORKFLOW.md` §8. Read that file and
`docs/founder-guide-gap-analysis.md` before your first edit.

---

## 1. Start here — the three things that will bite you first

**1. Run `npm run db:generate` immediately after any branch switch.** The
generated Prisma client lives in the repository-root `node_modules` and is *not*
per-branch. After switching you are compiling against whichever schema was
generated last. This produces the confusing signature of **a green `typecheck`
and a red `next build` on the same tree**, because Turbo replays a cached
typecheck while `next build` runs its own `tsc`. Recorded as §4.11.

**2. `rm -rf apps/*/.next` after a branch switch too.** Next's generated
`.next/types/validator.ts` still imports routes from the other branch and fails
with `Cannot find module '../../app/.../page.js'`. Nothing is wrong with the
code.

**3. Do not trust `docs/founder-guide-gap-analysis.md` without opening the files
it names.** Four of its claims were verified wrong this session — see §5 below.
It is otherwise an excellent document, and its corrections are now written into
it with the originals preserved in `<details>` blocks.

---

## 2. What was done

Nine gaps closed, one PR each, all squash-merged to `Dev` and then to `main`.

| PR | Gap | What was actually wrong |
|---|---|---|
| #283 | GAP-1 reversal | Route was **dead code** — it required a session cookie the admin console never sends, so every reversal returned 401. Unreachable from both ends, and untested, so nothing noticed |
| #284 | GAP-6 fifty-member cap | No constant, no check, no configuration — the 51st member walked straight in |
| #285 | GAP-4 goal failed | Marked goals Failed and told nobody, while the *achieved* job announced itself |
| #286 | GAP-5 statement notices | Wrote to the in-app inbox only; members who chose SMS or email were never told |
| #287 | GAP-7 invitations tile | Eleven of the guide's twelve tiles existed |
| #288 | GAP-2 goal proposals | `createGoal` asserted admin, so the six-step flow began with something a member could not do |
| #289 | GAP-3 goal outcome | No field for a note, receipt or photograph — a Goal was achieved and the story stopped |
| #290 | GAP-8 member can leave | No self-service route existed at all |
| #291 | GAP-9 Netcash | Adapter posted JSON to REST paths that do not exist; the service is WCF SOAP |

**PR #273 was closed, not merged.** It replaces Google Fonts with local
equivalents — the exact change recorded as reverted in §4.3 M-5, because the
assumption behind it was wrong. Merging it would re-introduce a documented
regression into a green build.

---

## 3. Decisions the owner took — do not re-litigate these

Asked and answered on 2026-08-07:

| Question | Decision |
|---|---|
| A rejected Goal proposal — deleted or kept? | **Kept**, as a fifth `GoalStatus` (`REJECTED`) |
| Documenting a Goal outcome — what is required? | Written note **required**, photo/receipt **optional** |
| A member leaving — immediate or acknowledged? | **Immediate** |
| Where does reversal logic live? | **One copy**, in the member app; the console calls across |
| How is a reversal reason stored? | **Additive column** on `Transaction`, visible to the member |

---

## 4. Outstanding — nothing is blocked on engineering

### 4.1 The Netcash dry run — the only real gap

**The adapter has never spoken to a live Netcash account.** It is built against
the vendor's published contract (live WSDL + XSD, fetched and transcribed, not
inferred) and covered by 21 contract tests. **A contract test is not a
settlement.**

Before any real collection:

1. Obtain the Netcash account and its **debit order service key**.
2. Set `NETCASH_DEBICHECK_TEMPLATE_ID` (e.g. `NCDCT000000001`). **Required when
   live — the app refuses to boot without it.**
3. Call `checkServiceKey()` (`apps/web/lib/netcash.ts`) — read-only, cheap, and
   confirms the key is live and authorised for debit orders.
4. Run **one** member through **one** full cycle in test mode before anyone else.

**An ISV agreement is not required.** Netcash publishes a default software
vendor key (`24ade73c-98cf-47b3-99be-cc7b867b3080`); a vendor-specific GUID
comes only with an ISV agreement and is optional. Do not assume onboarding is
blocked on one.

### 4.2 One interpretation to confirm with the founders

A `RESIGNED` member **keeps the ability to sign in**, so their history stays
reachable to them. That is this codebase's reading of "leave at any time, with
your history intact" — it is stated in the code and flagged in #290, but it is
an interpretation, not a quotation. If the founders want them locked out, the
change is one line in `apps/web/lib/auth.ts` beside the `SUSPENDED` check.

### 4.3 Deploy prerequisites

Seven migrations must run. All additive:

```
20260807120000_transaction_reversal_reason
20260807120001_contribution_reversed_templates
20260807130000_goal_failed_template
20260807140000_statement_ready_templates
20260807150000_goal_proposals          -- adds GoalStatus.REJECTED
20260807160000_goal_outcome
20260807170000_member_resignation      -- adds UserStatus.RESIGNED
```

The two `ALTER TYPE … ADD VALUE` migrations are transactional on PostgreSQL 12+;
neither writes a row using the new value in the same transaction, which is the
actual restriction.

**New template rows reach an existing database only because they are new**
(§4.8). Four new slugs were added this session and each ships with an
`ON CONFLICT DO NOTHING` insert migration for exactly that reason. If you ever
*change* a template body, seeding will not update it — that needs a deliberate
one-row update per environment.

---

## 5. Findings recorded — what the gap analysis got wrong

All four came from searching for a keyword rather than opening the file.
Corrections are in the document itself.

1. **GAP-1 claimed no service, route or UI existed.** Three of the four already
   did — `createReversal` was complete with five tests, the route existed, and
   the schema had carried `reversalOfId` with a partial-unique double-reversal
   guard since May. The real defect was reachability.
2. **GAP-1 instructed storing the reversal with a *negated* amount.** Not
   followed, and it would have been a bug: this repository stores it **positive**
   and excludes `type: REVERSAL` from every inflow sum, with a parity test
   binding the Prisma filter and the raw-SQL fragment together.
3. **GAP-5 claimed a `monthly-statement` template was already seeded.** None
   existed — the notice had never called `queueNotification`, so nothing had
   needed one.
4. **GAP-9 said "do not start without sandbox credentials."** Credentials are
   what you need to *test* an adapter, not to *build* one. The contract is
   public and the WSDL and XSD are anonymously fetchable. This is now §4.10, and
   it generalises: **"blocked on X" deserves the same scrutiny as "it doesn't
   touch money"** — state precisely what the missing thing would let you do, and
   check whether that is the same as what you were about to do.

### Four Netcash defects found by reading the real contract

Each would have cost real money:

- **Amounts are in cents** in batch field 162 and in `DebiCheckAmendAuthentication`,
  but in **rands** in `DebiCheckAuthenticate`. This system is rands throughout.
  R450 sent unconverted collects R4.50.
- **`BatchFileUpload` returns a file token, not a settlement.** The bank has not
  answered. Recording it as SUCCESS credits money that has not moved.
- **Two vendor spellings must be reproduced verbatim.** `SofwareVendorCode` is
  misspelled in Netcash's own schema and `reasonCode` is lower-case among
  capitalised siblings. XML names are case-sensitive — "correcting" either breaks
  the call. Tests pin both so nobody helpfully fixes them.
- **`NETCASH_API_URL` defaulted to `NSWSSX/NetcashTest.asmx`** — a different,
  older service exposing no DebiCheck method at all.

A development-only simulator that returned plausible successes whenever no
service key was set was **deleted**. It made a broken integration look like a
working one on every developer machine, and is much of why the mismatch survived
so long. The mock gateway is now the single stand-in and selecting it is an
explicit decision.

---

## 6. Risks

| Risk | Who it affects | How you would notice |
|---|---|---|
| **`NETCASH_DEBICHECK_TEMPLATE_ID` unset on a live deploy** | Everyone — the app will not boot | Deploy fails at env validation with `Invalid environment variables` |
| **Netcash adapter never exercised live** | Every member, on the first collection | A batch rejected wholesale, or a code we map wrongly. Mitigate by running one member first |
| **Migrations not run before deploy** | Everyone | Prisma errors on any query touching the new columns |
| **A wrong service key reads as fifty declined debits** | Every member at once | Mitigated: `isConfigurationFailure()` separates our misconfiguration from a member's bank declining. Do not collapse that distinction |
| **The Founder Guide PDF blob is still retrievable from GitHub by SHA** | The four founders | Purged from `main` and `Dev` history by `git filter-repo` on 2026-08-07 and both branches force-pushed, so it is gone from every branch and every local clone that re-clones. **But GitHub still serves the old commit `d3ddd74` and blob `3bf27523…` directly** — merged pull requests keep `refs/pull/*` alive and GitHub does not garbage-collect on request. See §9 for the one remaining step, which only the owner can take |
| **CI is still not executing** (§4.3 H-3) | Everyone | GitHub Actions minutes exhausted on the free tier. **Every result in this document was verified locally.** Nothing automated is checking the repository |

---

## 7. Recommended next actions, in order

| # | Action | Effort | Blocked on |
|---|---|---|---|
| 1 | Apply to Netcash; obtain account, service key and mandate template id | Days–weeks | External |
| 2 | Set the live env vars, run `migrate deploy`, call `checkServiceKey()` | 1 hour | Action 1 |
| 3 | One member, one full debit cycle in test mode, end to end | Half a day | Action 2 |
| 4 | Confirm the `RESIGNED` sign-in interpretation with the founders | Minutes | Founders |
| 5 | Restore CI (H-3) — minutes exhausted; nothing automated verifies this repo | Half a day | Billing decision |
| 6 | Encryption key rotation (H-5) — one key, no key id in the envelope, no previous-key fallback. Tracked **P2 · BEFORE REAL DEBITS** | 1–2 days | None |
| 7 | Alerting on failed collections and ledger drift (M-3) | 1 day | None |

**Actions 5, 6 and 7 are the honest "production readiness" list.** None of them
were in scope this session and none are blocked — they simply were not asked
for, and scaling work down is the owner's decision, not an engineer's.

---

## 8. What was explicitly not done

- **No live Netcash call.** Not once, by anyone, ever.
- **No history rewrite** to purge the Founder Guide PDF from `main`/`Dev`.
- **No CI restoration** — the workflow exists and is correct; it is not running.
- **No key rotation, no alerting, no POPIA retention policy** — all pre-existing,
  all still open, none regressed.
- **No changes to badge thresholds, contribution amounts, fee calculations,
  debit days or grace periods.** Those are the owner's decisions (§6).

---

## 9. The Founder Guide PDF — what was done and what is left

The PDF was committed by accident twice during the merge sequence and reached
`Dev`'s history. On 2026-08-07 it was purged with `git filter-repo
--invert-paths` and both branches were force-pushed. Verified afterwards:

- Gone from every commit on `main` and `Dev`.
- Gone from the local object store after `reflog expire` + `gc --prune=now`.
- All four gates re-run green on the rewritten history before pushing (941 tests).
- A full pre-rewrite backup bundle was taken first.
- `*.pdf`, `.codex/` and `.vscode/` are now in `.gitignore`, so a broad
  `git add` cannot reintroduce it.

**What a rewrite cannot do, and this one did not:**

GitHub still serves the pre-rewrite commit `d3ddd74` and the blob
`3bf2752348503a60bae2e1039cc7835d85ff8446` (15.5 MB) by direct SHA. Merged
pull requests retain `refs/pull/<n>/head`, which keeps those objects reachable,
and GitHub does not garbage-collect on demand.

**The one remaining step, which only the repository owner can take:** open a
GitHub Support request asking them to garbage-collect unreachable objects and
purge cached views for this repository, citing the commit and blob SHAs above.
Until then, treat the document as retrievable by anyone with repository access.

Scope of exposure in the meantime: the repository is **private** with a single
collaborator, so this is the owner's own account plus GitHub staff — not the
public. That is why this was recorded rather than treated as an incident.
