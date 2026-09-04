# External audit register

A series of independent audits of this system, received one at a time. Each is
recorded here **before** any of it is implemented, and each is recorded with its
findings checked against the code rather than accepted on sight.

## Why the findings are verified before they are scheduled

An audit is evidence, not a work order. Two things go wrong when it is treated
as one:

- **A stale finding gets re-fixed.** Audit 1 reports the `DEPLOY_ENV`
  precedence bug that let production select the mock gateway. That is a real
  bug, it did happen, and it was fixed — the platform's `VERCEL_ENV` now
  outranks any declaration, and a test pins it. Implementing the recommendation
  would mean changing correct code back toward the shape that caused the
  incident.
- **A finding gets scheduled at the wrong urgency.** This Foundation has **no
  payment gateway**: the DebiCheck application was declined and a live
  deployment selects `disabledGateway`. Every Netcash finding is therefore real
  and *dormant* — it cannot produce a wrong outcome today, and it absolutely
  must be closed before a gateway is ever enabled. Ranked by raw severity those
  findings come first; ranked by what can actually go wrong this month they come
  after the concurrency ones.

So every finding carries a verification verdict and a "live now / dormant"
classification. Both are stated per finding, with the file and line that
settles it.

### Verdict vocabulary

| Verdict | Meaning |
|---|---|
| **CONFIRMED** | Reproduced in the code at the cited line |
| **CONFIRMED, NARROWER** | The defect is real; part of the auditor's description does not hold |
| **CONFIRMED, WORSE** | The defect is real and larger than reported |
| **STALE** | Was true; already fixed. Do not implement |
| **UNVERIFIED** | Not yet checked — say so rather than imply either answer |

## The register

| # | Audit | Received | Findings | Status |
|---|---|---|---|---|
| 1 | [Master audit — first pass](audit-01-master-audit-first-pass.md) | 2026-09-04 | 13 | Documented, verified, not scheduled |
| 2 | [State machines, concurrency, security boundary](audit-02-state-machine-concurrency-security.md) | 2026-09-04 | 20 (14–33) | Documented, verified, not scheduled |
| 3 | [Deeper money flow and API integrity](audit-03-money-flow-api-integrity.md) | 2026-09-04 | 12 (33–44) | Documented, verified, not scheduled |

## Findings repeat across audits

Later rounds rediscover earlier findings, sometimes with better evidence. A
rediscovery raises confidence; it does not add work. Where a finding duplicates
one already recorded, its entry says so and points at the original, and the new
evidence or proposed remedy is carried into that item rather than scheduled
twice.

Round 3 restarts its numbering at 33, which collides with Round 2. Findings are
therefore always cited round-prefixed: **A2-F33** is the webhook dedupe
endorsement, **A3-F33** is the debit-day amendment defect.

Audit 2 also **answered** an audit 1 open question (A2-F26 verified the
suspension sibling of A1-F05) and **corrected one of our own narrowings**
(A2-F25 on cancellation). Both are recorded where they happened, not silently
folded in.

## Process

1. Each audit is written up as `audit-NN-<slug>.md` as it arrives, with the
   findings preserved and a verification annex added.
2. Findings get stable IDs (`A1-F05`) so later documents can reference them
   without restating them.
3. When every audit has been received, a single implementation plan orders the
   surviving work across all of them.
4. Implementation follows that plan.

Nothing is implemented during steps 1–3.
