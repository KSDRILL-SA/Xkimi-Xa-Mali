-- Drop two indexes on notifications that no query can use.
--
-- notifications_status_idx (status) is a strict PREFIX of
-- notifications_status_createdAt_idx (status, createdAt). Postgres can serve
-- any status-only lookup from the wider index, so the narrow one has never been
-- chosen and never will be.
--
-- notifications_channel_idx (channel) has four possible values across the whole
-- table. Nothing filters on channel alone — the member feed filters by userId
-- with channel as an optional extra, which the (userId, createdAt) index already
-- serves — and even if something did, the planner would not use an index that
-- selects a quarter of the rows.
--
-- This is a write-path change, not a read one. notifications takes a row per
-- member per event and every insert maintained eleven index entries. Measured
-- from an identical starting state, 20 000 inserts against 40 000 existing rows:
--
--   with all eleven indexes   2 486 ms
--   with these two dropped    2 285 ms     ~8% cheaper
--
-- Every query plan on this table was byte-identical before and after: the flush
-- claim still uses the partial idx_notifications_queued, the member feed still
-- uses (userId, createdAt), and stalled recovery still uses (status, updatedAt).

DROP INDEX IF EXISTS "notifications_status_idx";
DROP INDEX IF EXISTS "notifications_channel_idx";
