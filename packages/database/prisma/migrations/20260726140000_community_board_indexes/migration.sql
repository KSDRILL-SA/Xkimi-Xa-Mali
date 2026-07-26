-- Index the two queries that render the community message board.
--
-- Measured on 20 000 top-level messages and 40 000 replies:
--
--   board page   31.5ms -> 0.86ms   (was scanning 19 001 rows to return 20)
--   replies      38.8ms -> 1.60ms   (was a sequential scan over 59 001 rows)
--
-- Both are PARTIAL indexes, and that is what makes them work. A plain composite
-- on the same columns was measured too and the planner ignored it for the board
-- query, still preferring community_messages_isPinned_idx and filtering 41 000
-- rows away. Restricting the index to the rows the query actually wants gives
-- the planner an index whose entire contents are the answer, already in the
-- required order — so LIMIT 20 reads 20 entries and stops.
--
-- They are also smaller: 600 kB for the board index against 2 576 kB for the
-- plain composite that did not help.
--
-- Prisma's @@index cannot express a WHERE clause, so these live in raw SQL and
-- are recorded as a comment on the model, exactly as goals_one_primary is.

-- The board: top-level, undeleted, pinned first then newest.
CREATE INDEX "community_messages_board_idx"
  ON "community_messages" ("isPinned" DESC, "createdAt" DESC)
  WHERE "isDeleted" = false AND "replyToId" IS NULL;

-- The replies loaded for each message on that page.
CREATE INDEX "community_messages_replies_idx"
  ON "community_messages" ("replyToId", "createdAt")
  WHERE "isDeleted" = false;
