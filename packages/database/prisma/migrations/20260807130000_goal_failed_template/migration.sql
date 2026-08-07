-- Add the 'goal-failed' notification template.
--
-- Sent to the members who pledged toward a Goal that reached its deadline
-- without reaching target. Until now that happened in silence: the nightly
-- deadline checker marked the goal Failed and returned a count, so a Goal the
-- circle had pledged toward lapsed overnight and nobody heard.
--
-- Seeded for fresh installs; inserted here for existing databases. Idempotent —
-- the slug is unique, so re-running is a no-op.
--
-- Deliberately NOT in MANDATORY_SLUGS. This is news about a goal, not about
-- money leaving a member's own balance, so a member who has switched SMS off is
-- entitled not to receive it. The in-app message reaches them either way.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_goal_failed',
  'goal-failed',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: "{{goal}}" did not reach its target by its deadline and has been marked Failed. No funds were released - nothing has left the pool: {{url}}'
)
ON CONFLICT ("slug") DO NOTHING;
