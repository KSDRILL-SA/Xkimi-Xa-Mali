-- Tell a member their Founder badge has been granted.
--
-- The badge is granted by hand by an admin, so it appears on an account without
-- the member having done anything to cause it. Unannounced, that reads as a bug
-- rather than as an honour.
--
-- Email only. It is not money moving and it is not urgent, so it does not earn
-- an SMS. Deliberately NOT in MANDATORY_SLUGS either: a member who has switched
-- email notifications off has said they do not want this kind of message, and
-- this is news rather than an obligation.
--
-- Seeded for fresh installs; inserted here for existing databases. Idempotent —
-- the slug is unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_founder_badge_granted',
  'founder-badge-granted',
  'EMAIL',
  'Your Founder badge - Xkimm Xa Mali Foundation',
  'Hi {{firstName}}, the Founder badge has been added to your account. It marks you as one of the four who started this collective, it sits alongside whatever contribution badge you have earned, and it stays with your account for good.'
)
ON CONFLICT ("slug") DO NOTHING;
