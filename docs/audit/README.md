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

## Process

1. Each audit is written up as `audit-NN-<slug>.md` as it arrives, with the
   findings preserved and a verification annex added.
2. Findings get stable IDs (`A1-F05`) so later documents can reference them
   without restating them.
3. When every audit has been received, a single implementation plan orders the
   surviving work across all of them.
4. Implementation follows that plan.

Nothing is implemented during steps 1–3.
