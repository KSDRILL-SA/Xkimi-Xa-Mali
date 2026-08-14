-- Seed heartbeat rows for the compliance jobs.
--
-- `COMPLIANCE_JOBS` in `apps/web/lib/job-heartbeat.ts` watches the two jobs that
-- enforce statutory duties rather than move money: the monthly POPIA retention
-- survey and the weekly data-request deadline check. They are kept out of
-- `WATCHED_JOBS` on purpose — that list's admission rule is that silence costs
-- money, and its value is that everything on it is worth an SMS — so these are
-- reported at `warning` instead.
--
-- Same reasoning as the original seed in `20260808140000_job_heartbeats`: a
-- missing row means "never beaten" and the watcher treats it as overdue, which
-- is the correct default for a job that was never registered. But without this
-- seed, the first deploy after these jobs are added would alert immediately and
-- keep alerting — the retention survey only runs on the 1st, so a deploy on the
-- 2nd would report it silent for the better part of a month before it had any
-- chance to beat.
--
-- Seeding gives each job one full silence window to prove itself. A job that
-- never registers is still caught, exactly one window later.
INSERT INTO "job_heartbeats" ("jobId", "lastRunAt", "updatedAt") VALUES
  ('retention-survey',   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('dsr-deadline-check', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('backup-watch',       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("jobId") DO NOTHING;
