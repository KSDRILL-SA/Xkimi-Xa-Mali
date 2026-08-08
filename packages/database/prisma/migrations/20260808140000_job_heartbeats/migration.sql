-- Evidence that a scheduled job ran.
--
-- Every alert this system raises is raised *by* a job that ran. A job that never
-- fires at all raises nothing: no error, no failed transaction, no alert, and
-- from the outside it is indistinguishable from a quiet month. On debit night
-- that is nobody being collected, with the system reporting itself healthy.
--
-- One row per watched job, rewritten at the end of each completed run. There is
-- no expected-interval column on purpose — that lives beside the cron
-- expression in `apps/web/lib/job-heartbeat.ts`, so there is only one place for
-- it to be wrong.

CREATE TABLE "job_heartbeats" (
    -- The Inngest function id, so a row found here is findable in the dashboard.
    "jobId" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_heartbeats_pkey" PRIMARY KEY ("jobId")
);

-- Seed the currently watched jobs as though they had just beaten.
--
-- A missing row means "never beaten" and the watcher treats it as overdue —
-- deliberately, because the alternative is the C-2 failure mode where absent
-- evidence reads as good news. But that would make the very first deploy after
-- this migration raise five critical alerts before any cron has had a chance to
-- fire even once. Seeding at migration time gives each job one full silence
-- window to prove itself, and a job that never registers is still caught
-- exactly one window later.
--
-- A job added to the registry after this migration has no row and is therefore
-- overdue from the moment it is watched. That is the correct default: it will
-- alert once, and the first successful run clears it.
INSERT INTO "job_heartbeats" ("jobId", "lastRunAt", "updatedAt") VALUES
  ('debit-run',                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('transaction-retry-failed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ledger-reconciliation',    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mandate-status-sync',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('notification-flush',       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('job-heartbeat-check',      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("jobId") DO NOTHING;
