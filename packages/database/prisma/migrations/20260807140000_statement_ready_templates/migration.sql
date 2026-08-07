-- Add the 'statement-ready' notification pair.
--
-- The monthly statement notice wrote straight into the in-app inbox and stopped
-- there. The guide offers four ways to hear from the Foundation and lists a
-- ready statement among the things you are told, so a member who had chosen SMS
-- or email was never told at all — the message sat in an inbox they had no
-- reason to open.
--
-- No template existed for this; the notice had never gone through
-- queueNotification, so there was nothing to seed one for.
--
-- Seeded for fresh installs; inserted here for existing databases. Idempotent —
-- the slug is unique, so re-running is a no-op.
--
-- Deliberately NOT in MANDATORY_SLUGS. A statement being ready is an invitation
-- to look, not money moving, so a member who has switched a channel off is not
-- overridden. The in-app message is written unconditionally.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_statement_ready_sms',
  'statement-ready-sms',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation: {{firstName}}, your {{period}} statement is ready to download: {{url}}'
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_statement_ready_email',
  'statement-ready-email',
  'EMAIL',
  'Your {{period}} statement is ready - Xkimm Xa Mali Foundation',
  'Hi {{firstName}}, your contribution statement for {{period}} is ready to download from the Statements page: {{url}}'
)
ON CONFLICT ("slug") DO NOTHING;
