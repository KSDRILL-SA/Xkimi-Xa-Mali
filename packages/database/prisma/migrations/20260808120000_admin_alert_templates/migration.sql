-- Add the admin operational-alert pair.
--
-- Every alert this system raised ended at an in-app inbox message. On debit
-- night, "nine contributions were not collected" was filed in a web page nobody
-- had a reason to open, and the runbook's own P1 — "money not moving on debit
-- day, respond immediately" — depended on somebody happening to log in.
--
-- These two templates are how a critical alert leaves the building. Seeded for
-- fresh installs; inserted here for existing databases. Idempotent — the slug is
-- unique, so re-running is a no-op.
--
-- Both ARE in MANDATORY_SLUGS, unlike most of the pairs added recently. They are
-- not member notifications: an admin who switched SMS off for badge news must
-- not thereby stop being told that a debit run collected nothing.
--
-- The SMS body is short and plain ASCII on purpose. An em dash or an emoji
-- forces the message into UCS-2 and cuts a segment from 160 characters to 70,
-- and this is the one message that goes out when money did not move.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_admin_alert_sms',
  'admin-alert-sms',
  'SMS',
  NULL,
  'Xkimm Xa Mali Foundation alert: {{title}}. Full detail is in your admin inbox.'
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_admin_alert_email',
  'admin-alert-email',
  'EMAIL',
  'Action needed: {{title}}',
  '{{title}}

{{detail}}

This is an automated operational alert from the Xkimm Xa Mali Foundation system.'
)
ON CONFLICT ("slug") DO NOTHING;
