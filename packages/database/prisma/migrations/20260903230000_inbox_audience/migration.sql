-- Split an inbox that serves one person wearing two hats.
--
-- Operational alerts have always gone only to ADMIN-role users, so no member
-- was ever seeing them. But the founder holds both roles, and their inbox
-- merged the two streams: a failed debit run sat next to their own payment
-- receipt, and the operational half is what a busy person scrolls past on the
-- way to what actually concerns them.
--
-- Category could not make this distinction. A statement notice and an
-- operational alert are both SYSTEM, so audience is a separate axis.
CREATE TYPE "InboxAudience" AS ENUM ('MEMBER', 'ADMIN');

ALTER TABLE "inbox_messages"
  ADD COLUMN IF NOT EXISTS "audience" "InboxAudience" NOT NULL DEFAULT 'MEMBER';

-- Read one audience at a time, with an unread count per tab.
CREATE INDEX IF NOT EXISTS "inbox_messages_userId_audience_readAt_idx"
  ON "inbox_messages"("userId", "audience", "readAt");

-- A deliberately narrow backfill.
--
-- Only operational alerts are moved, and only because `raiseAlert` prefixes
-- every one of them with a severity marker that nothing else in this system
-- writes — so the match is exact rather than a guess.
--
-- Other messages `notifyAdmins` has sent (a goal awaiting approval, a mandate
-- needing review) carry no such marker and stay under MEMBER. Misfiling a
-- member's own message into a tab they rarely open is worse than leaving a
-- handful of old admin notices where they already are, and the split is
-- correct for everything written from here on.
UPDATE "inbox_messages"
   SET "audience" = 'ADMIN'
 WHERE "title" LIKE '🔴%' OR "title" LIKE '⚠️%';
