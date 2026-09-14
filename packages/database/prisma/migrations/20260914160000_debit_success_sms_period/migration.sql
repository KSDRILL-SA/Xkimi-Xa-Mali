-- The offline-payment SMS confirmation never said which month it was for.
--
-- The sibling email (`debit-success-email`) always has: "your R{{amount}}
-- contribution for {{period}} has been processed successfully." The SMS was
-- "R{{amount}} contribution received" and stopped there — fine for a single
-- month paid on time, ambiguous the moment someone is catching up (a June
-- payment recorded alongside a July one, both arriving the same week) and
-- both texts landing within minutes of each other with no way to tell them
-- apart. Found live, 2026-09-14, by an admin who had just recorded exactly
-- that: a June contribution, whose SMS gave no indication it was for June.
--
-- Exact-match guard, same reasoning as the branding migration this repo
-- already has: seeding is create-only, so any database seeded before this
-- still carries the old body — but an admin may since have reworded it by
-- hand, and this must not clobber that. Only touches the row if it still
-- reads exactly as shipped; a no-op on any re-run once it has applied once.
UPDATE "notification_templates"
SET "body" = 'Xkimi Xa Mali Foundation: R{{amount}} contribution for {{period}} received. Thank you, {{firstName}}!'
WHERE "slug" = 'debit-success'
  AND "body" = 'Xkimi Xa Mali Foundation: R{{amount}} contribution received. Thank you, {{firstName}}!';
