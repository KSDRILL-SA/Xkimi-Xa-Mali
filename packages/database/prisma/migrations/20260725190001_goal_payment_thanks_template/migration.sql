-- Add the 'goal-payment-thanks' notification template.
--
-- Sent to thank a member for a directed extra payment toward a goal. Seeded for
-- fresh installs; inserted here for existing databases. Idempotent — the slug is
-- unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_goal_payment_thanks',
  'goal-payment-thanks',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: Thank you! Your R{{amount}} toward "{{goal}}" has been received — your badge points just got a boost.'
)
ON CONFLICT ("slug") DO NOTHING;
