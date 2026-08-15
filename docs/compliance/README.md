# Compliance & Governance

**The documents that get asked for by people who do not read code.**

Everything else in `docs/` describes how the system is built. This folder
describes what the Foundation *is* — the material Netcash, a bank, NASASA, the
Information Regulator, and the members themselves will ask to see.

---

## The documents

| Document | Reader | Status |
|---|---|---|
| [`constitution.md`](constitution.md) | Members; NASASA; the bank | **Drafted** — needs 12 decisions + attorney review |
| [`popia-compliance.md`](popia-compliance.md) | Information Regulator; members | **Drafted** — 8 gaps identified |
| [`paia-manual.md`](paia-manual.md) | Anyone; statutorily required | **Drafted** — needs details + publication |
| [`mandate-lifecycle.md`](mandate-lifecycle.md) | **Netcash**; the bank | **Complete** for the system as built |
| [`due-diligence-pack.md`](due-diligence-pack.md) | The bank; Netcash risk | **Complete**, including what has not been done |
| [`breach-response.md`](breach-response.md) | Leadership, under pressure | **Complete** |
| [`registrations.md`](registrations.md) | The owner | **The action list** |

**Start at [`registrations.md`](registrations.md).** It is the only one with things
to *do*, and it sequences them so they stop blocking each other.

---

## What was drafted and what was decided

These documents were written **from the system**, not from a template. Every rule
described is one the code actually enforces, and the numbers are read from
`packages/utils/src/constants.ts` and the Prisma schema rather than remembered.

That is the point of them. A constitution that says the contribution minimum is
R100 because someone recalled it is a document that will drift. This one says R100
because the system rejects R99.

**What was not decided:** anything in `[BRACKETS]`. Those are questions for the
members, an attorney, or an accountant — not gaps in the drafting. They are
gathered at the end of each document so they can be worked through in one sitting.

---

## The honest position

The Foundation is **pre-production**. No live rand has moved. The Netcash dry run
is outstanding, and nothing is deployed.

This is stated plainly in `due-diligence-pack.md` clause 8 and
`mandate-lifecycle.md` clause 8, deliberately. An organisation asking to *begin*
is in a strong position. An organisation implying it has already begun, when its
counterparty can see a transaction volume of zero, is in a much worse one.

---

## Two things worth knowing before the first meeting

**1. You may not need to register anything.** A voluntary association with a
properly drafted constitution is already a legal person in South African law — it
can hold a bank account in its own name and needs no registration with CIPC or
anyone else. Most stokvels are exactly this. The constitution has been drafted with
those characteristics in mind. If an attorney confirms it, the cost and time of
this whole programme drops sharply. See `registrations.md`, item 1.

**2. You are already on DebiCheck.** The system is configured for authenticated
mandates, where the member authorises the debit with their own bank. That is the
single control Netcash cares most about, and the answer to "prove they agreed."
Most applicants at this stage do not have it.

---

## What remains, on the engineering side

Not external, but blocking production. Tracked in `registrations.md` clause 11.

| # | Item | Severity |
|---|---|---|
| 1 | ~~Documented backup and restore procedure~~ | ✅ [`../backup-and-restore.md`](../backup-and-restore.md); a daily watcher in the app now catches a backup that has stopped being *scheduled* — needs a read-only token, §3b-ii |
| 2 | ~~Retention enforcement~~ | ✅ Monthly survey, report-only; the survey itself is now watched, so its silence is not silent |
| 3 | ~~Data-subject-request log~~ | ✅ Admin console → Data Requests; members submit at `/privacy/request`, deadlines watched weekly |
| 4 | ~~PAIA manual published~~ | ✅ `/paia`, linked in the footer |
| 5 | ~~Audit log not actually append-only~~ | ✅ Enforced by a database trigger, found by the first drill |
| 6 | **The production restore drill** — development was drilled 2026-08-15; production data and the `age` round trip were not | **High — should block go-live** |
| 7 | Decide on `REQUIRE_PASSWORD_POLICY_RESET` | Medium |

On item 6: the development drill was worth running on its own — it found that the
audit log could be updated and deleted by the ordinary application role, and that
two of the eight verification checks could never have passed. What it did **not**
exercise is production data, or the `age` encrypt-and-decrypt round trip that
every scheduled backup depends on. A backup that encrypts perfectly and cannot be
decrypted is worse than none, because it is believed. See
[`../backup-and-restore.md`](../backup-and-restore.md) §8.

---

## Maintaining these

When the system changes in a way these documents describe — a contribution limit,
the membership cap, what is encrypted, how a mandate is authorised — **these
change too.** A compliance pack that describes last year's system is worse than
none, because it is believed.

Re-verify against the code at each annual general meeting, and whenever a
regulator or counterparty is about to read one.
