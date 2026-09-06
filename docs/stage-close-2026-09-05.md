# Stage close — 2026-09-05

**Read this first if you are picking the project up after the pause.**

Development stopped here deliberately. Not because the system is finished, and
not because anything is broken — because **the next thing the Foundation needs
is not code.** It is a record of real contributions, month after month, that a
collections partner will accept as evidence.

Nothing in the repository can produce that. Only time and real payments can.

---

## What this stage was for

The Foundation collects money without a payment provider. Members pay by
transfer or in cash, and an administrator records each payment against a member
and a month with proof of payment attached.

That is the whole operating model right now, and the system supports it end to
end. Building it was this stage's job, and that job is done.

## What a member can do today, start to finish

| Step | Where it happens |
|---|---|
| Be invited by name, with who vouched for them | Admin console → Invitations |
| Register against that invitation and set a password | Member app, invitation link |
| Be activated by leadership | Admin console → Members |
| See what they owe this month, and where to pay it | Member dashboard → Contributions. The Foundation's banking details are on the page |
| Pay by EFT or hand over cash, and send proof | Outside the system, by design |
| Have it recorded against the right month, with the proof kept | Admin console → Contributions |
| See it on their record, with the proof openable | Member dashboard → Contributions, and the statement PDF |
| Commit monthly to a goal, be told each month what it asks for, and have it closed when they pay | Member dashboard → Goals; recorded by an administrator |
| Give a one-off amount to any open goal | Same |
| Read the fund, the goals, the community board, their inbox and their badge | Member dashboard |
| Download a statement for any month, unasked | Member dashboard → Statements |
| Leave, and keep every record | Member dashboard → Settings |

The member-facing payment page does **not** read as an outage. It explains the
three steps — pay, send proof, leadership records it — and says plainly that
nothing is deducted automatically.

## What is deliberately switched off

There is no collections provider, so `selectGateway()` returns the **disabled
adapter** on the live deployment. Every gateway money operation refuses, and the
member-facing payment form is replaced by the instructions above.

This is a state, not a fault. The production build log says so in words:

```
[go-live] deployment is LIVE; payment gateway is disabled
[go-live]   no provider is configured, so every money operation refuses.
[go-live]   This is the expected state: the collections application was declined.
[go-live]   Payments are recorded by an administrator in the console instead.
```

The debit-order machinery — mandates, the debit run, batch submission, webhook
settlement, retries, the dispute and presentment rules from the provider's own
contract — is **built, tested and dormant**. It was audited against Appendix A
and four contract breaches were fixed before a single rand could pass through
it. See `docs/compliance/collections-application-brief.md`.

## What ends the pause

One thing: **a collections partner accepting the Foundation.**

The evidence that earns it is being generated now, by ordinary use — every
recorded contribution, with a name, a date and proof behind it, is a line in the
record a partner asks to see. That is the owner's track to run, and the
commercial side of it is deliberately not documented here.

When it lands, the work is `docs/audit/implementation-plan.md` **Phase 3** —
eight items, planned and unscheduled. Its one standing design recommendation:
make load-report polling the primary settlement mechanism and the webhook an
optional accelerant, because the polling contract is documented and the postback
contract is not.

## What carries into the pause

These are open. None of them blocks the current stage; all of them are worth
knowing before the system runs unattended for months.

| | What it is | Who can close it |
|---|---|---|
| **Phantom `MOCKTX` transactions** | Before the gateway defect was fixed, production briefly ran the stand-in and recorded settled payments no bank ever saw. The admin contributions page flags any transaction whose reference starts with `MOCKTX` in red. **Until they are reversed they are counted in the pool and against members' totals.** Whether any remain has not been verified from outside production | Owner, in the admin console |
| **Constitution clause 6.1** | Names the Capitec/KSDRILL account; members pay into ABSA. The amendment is drafted and unsigned — `docs/compliance/resolution-2026-09-banking.md` | Founders, by resolution |
| **The ABSA account name** | The app shows members "Xkimi Xa Mali Foundation". That must be the name the account is actually held in | Owner, against the bank |
| **`BACKUP_REPO` unset** | Backups run and the restore is proven, but the dead-man's switch is blind: it reports "cannot confirm" instead of "the backup has stopped" | Owner, one Vercel variable |
| **Backup key custody** | One copy, and the machine holding it cannot open the archive — it has a PostgreSQL 16 client and the dumps are written by 18. Needs Docker or a PG 18 client | Owner |
| **`NEXT_PUBLIC_GROUP_*` unset** | The banking details members are shown come from code defaults. Changing banks is currently a release, not a configuration change | Owner, four Vercel variables + redeploy |
| **NASASA** | Applied 2026-08-24, no reply | Owner |
| **`REQUIRE_PASSWORD_POLICY_RESET` off** | Passwords predating the twelve-character policy have not been force-reset | Owner |

Two decisions were taken under delegation and are worth a look when convenient:
the pool may not go negative (**D1**), an overpayment stands and is allocated to
what else is owed, oldest month first (**D2**/**D5**).

## One deployment is outstanding

**The member app's production build is one commit behind, and Vercel refused it
in words worth quoting:**

```
Resource is limited - try again in 1 day
(more than 100, code: "api-deployments-free-per-day")
```

That is the **Hobby plan's 100-deployments-per-day ceiling**, reached on
2026-09-05. It is not a build failure and not a code problem: three projects
deploy on every push, so a busy day spends the allowance quickly.

| App | Production is on | Needs |
|---|---|---|
| `admin.xkimixamali.co.za` | current — promoted 2026-09-05 | nothing |
| `xkimixamali.co.za` | current | nothing |
| `member.xkimixamali.co.za` | one commit behind | one promote, once the day rolls over |

**What the member app is missing is two low-severity hardening changes** — the
`X-Powered-By` header removal and a version string dropped from the health
endpoint. Nothing functional, nothing a member can see. It is safe to leave.

**To finish it**, once the limit resets:

1. Vercel → `xkimi-xa-mali-web` → **Deployments**
2. Find the newest **Ready** build whose commit matches `main`
3. Its `…` menu → **Promote to Production** → confirm

The dialog says *"a new deployment will be built using your production
environment"*, so it rebuilds with production variables rather than reusing
preview ones — which is why promoting is safe here and not a shortcut.

A push to `main` works too, but only if the allowance has room. **Pushing while
the limit is spent does nothing — Vercel drops the deployment rather than
queuing it**, so extra pushes are wasted rather than banked.

## The state it is being left in

| | |
|---|---|
| Branch | `main`, everything merged, no open branches |
| Deployed | All three apps live on `xkimixamali.co.za` — `member.`, `admin.`, apex and `www` |
| Migrations | Applied automatically on the production build; no pending migrations |
| Go-live variables | All set. The preflight reports clean |
| Backups | Running, encrypted, off-site, restore-proven — 40 tables, 623 rows |
| Founder Guide | Third edition, September 2026, describing the current mechanism |

Test and route counts are deliberately not written here. They were hand-counted
in three documents before and were wrong within weeks in every one of them —
`apps/web/__tests__/doc-drift.test.ts` now refuses that. Run the suite.

## If you are resuming

1. Read this page and `docs/audit/implementation-plan.md`.
2. Check the carried-forward table above — particularly the `MOCKTX` row, which
   is about money.
3. `npm install && npx turbo run typecheck lint test` before changing anything.
   A suite that was green months ago is a claim, not a fact.
4. Phase 3 only starts when a partner has said yes. Everything in it assumes a
   gateway that does not exist yet, and building against an imagined one is how
   the adapter came to be written against the wrong API shape the first time.
