# The Founder Badge

**Decided:** 2026-08-08 · **Status:** implemented in this change

A permanent mark on the accounts of the four people who founded the collective,
granted by an admin after the account exists.

---

## 1. The trap this design exists to avoid

The obvious implementation is a fifth value in `BadgeTier`. It does not work, and
it fails quietly rather than loudly.

`BadgeTier` is `AMATEUR → SEMI_PRO → PRO → WORLD_CLASS`, held on
`BadgeScore.currentBadge` and **computed** from contribution consistency,
timeliness and generosity. `badge-recalculation` runs monthly *and* on every
contribution status change, and `recalculateOne`
(`apps/web/services/badge.service.ts`) writes `currentBadge` from
`determineTier(metrics)` every single time.

So a `FOUNDER` value written into that column would be **overwritten the next
time that founder paid a contribution**. Worse, `TIER_RANK` — which drives
promotion, demotion and the grace period — would gain a fifth entry it has no
meaningful ordering for.

**A founder badge is conferred; a tier is earned.** They are different kinds of
thing and they live in different places. A founder who is also `AMATEUR` shows
both, side by side, and neither can affect the other.

## 2. What was decided

| Question | Decision |
|---|---|
| Storage | A `MemberDistinction` record — not a boolean, not a tier |
| Lifetime | **Permanent.** Survives resignation; a founder who leaves keeps it |
| Who grants | **The single admin.** Self-grant is allowed and recorded |
| Cap | **Four.** There are four founders and there will not be a fifth |
| Where shown | Member dashboard, badges page, community list, admin table, statement PDFs |

### Why a record and not `User.isFounder`

A boolean cannot answer *who granted this and when* — and it would be the only
privileged action in this system that cannot. Reversals, role changes, mandate
approvals and now alerts all leave a trail. This does too.

It also leaves room for a second kind of distinction later without another
migration, which is why `kind` is an enum with one value today rather than an
implied one.

### Why permanent

Founding is a historical fact. It happened, and a member leaving does not
un-happen it — the same reasoning that made resignation keep a member's history
rather than erase it (#290).

**Permanent is not the same as unfixable.** A badge granted to the wrong account
is an erratum, not a revocation, so there is an admin *remove* action that
deletes the record and writes an audit row. It exists to correct a mistake, not
to take an honour away.

### Why self-grant is allowed

There is one admin, and he is also a founder. Somebody has to grant the first
badge and there is nobody else to do it. Forbidding self-grant would make the
feature unusable rather than making it safer.

What matters is that it is *visible*: `grantedById` is stored, so a self-grant
reads as one in the audit log rather than being indistinguishable from a grant by
someone else.

### Why a cap of four

The same reasoning as the fifty-member cap (#284): a number that is a design
decision should be enforced rather than remembered. `FOUNDER_COUNT` lives beside
`MAX_MEMBERS` in `@xxm/utils/constants`, and the marketing site's founder roster
is checked against it by a test — the two encode the same fact and were free to
drift.

## 3. Shape

```prisma
enum DistinctionKind { FOUNDER }

model MemberDistinction {
  id          String          @id @default(cuid())
  userId      String
  kind        DistinctionKind
  grantedById String
  grantedAt   DateTime        @default(now())
  note        String?

  user      User @relation("DistinctionHolder", fields: [userId], references: [id], onDelete: Cascade)
  grantedBy User @relation("DistinctionGranter", fields: [grantedById], references: [id])

  @@unique([userId, kind])
  @@index([kind])
  @@map("member_distinctions")
}
```

`@@unique([userId, kind])` makes a double grant impossible at the database level
rather than only in the service — the same belt-and-braces as the reversal
guard.

`onDelete: Cascade` on the holder: erasing a member erases their distinctions.
The granter relation deliberately does **not** cascade — a granted badge must not
vanish because the person who granted it was removed.

### Layers

| Layer | File | Responsibility |
|---|---|---|
| Constants | `@xxm/utils` → `FOUNDER_COUNT` | The cap, and the number the marketing roster is checked against |
| Service | `apps/web/services/distinction.service.ts` | grant, remove, read; the cap; the audit trail; `withFounderFlag` |
| API | `apps/web/app/api/v1/admin/distinctions/route.ts` | `GET` / `POST` / `DELETE`, admin-gated |
| Presentation (web) | `apps/web/components/FounderMark.tsx` | Dashboard tile, badges page, community list |
| Presentation (admin) | `apps/admin/app/(dashboard)/badges/BadgesTable.tsx` | Beside the member name, not in the Tier column |
| Presentation (PDF) | `apps/web/lib/pdf/statement.tsx` | A pill under the account holder's name |

The PDF cannot share a DOM component — `@react-pdf/renderer` has its own element
set — so presentation is deliberately duplicated while the *data* is not.

The admin table reads the distinction table directly in
`apps/admin/lib/services/reports.ts` rather than through the member app's
service: the two apps share a database but not a service layer, and one query
for the page is cheaper than a round trip.

### Auth

The route follows the reversal route's trust model. The admin console holds no
session cookie for the member app and calls server-to-server with the shared
secret, so a route requiring a session outright would be unreachable by the only
caller that exists — which is exactly the bug #283 turned out to be, found only
because nothing had ever tested it. The internal path must forward the acting
admin's id and cannot fall back to "system".

## 4. What must never happen

- **`badge.service.ts` must never read or write `MemberDistinction`.** The
  composition happens in `withFounderFlag` and at the call sites instead. This is
  not fastidiousness: the moment the badge service *can* read that table,
  somebody will eventually make the recalculation consult it, and the separation
  that keeps a granted badge safe from a derived one is gone. A test asserts the
  source file does not contain the word at all.
- **Nothing needs cache invalidation today, and that is a fact rather than a
  gap.** `badge.service.ts` uses no cache, and `DashboardBadge` calls
  `getMyBadge` directly, so a grant is visible on the next request. *If you add
  caching to any of those reads, clear it in `distinction.service.ts`* — a badge
  that appears whenever a TTL happens to lapse reads first as "it didn't work"
  and then as "it works sometimes", which is worse.
- The marketing site's `FOUNDERS` array is **public presentation** — photos, bios,
  titles. It is not the source of truth for who holds the badge, and must not
  become one. The only thing tying them together is the count, and that is
  checked at compile time: `apps/website/lib/founders.ts` assigns the roster
  length to `typeof FOUNDER_COUNT`, so adding a fifth founder to either without
  the other stops the build.

## 5. The test that matters most

Grant a founder badge, then run `recalculateOne` through a promotion *and* a
demotion, and assert the distinction is untouched and the tier moved
independently.

That is the regression this whole design exists to prevent, and it is the one
that would otherwise be found in production, months later, by a founder noticing
their badge had quietly disappeared after paying a contribution.
