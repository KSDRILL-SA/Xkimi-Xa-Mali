-- Tell a member the bank has suspended their debit order.
--
-- Appendix A §15.2.1 of the provider contract: a mandate is suspended
-- automatically after the seventh consecutive unsuccessful collection. Nobody
-- chooses it — not the member, not leadership — and the debit run collects only
-- from ACTIVE mandates, so the visible effect is that the member's
-- contributions simply stop.
--
-- `mandate-cancelled` already exists and carries a comment explaining why
-- silence there is unacceptable: "the member's contributions simply stop and the
-- first they hear of it is a gap in their statement". That is more true here,
-- because a cancellation is at least somebody's decision.
--
-- §15.11 puts a clock on it too: thirteen months to reinstate, after which the
-- mandate leaves the register entirely and has to be created from scratch.
--
-- SMS rather than email, matching `mandate-cancelled`: money has stopped moving
-- and the member has to act.
--
-- Seeded for fresh installs; inserted here for existing databases, because the
-- seed is create-only and editing templates.ts alone changes nothing in
-- production. Idempotent — the slug is unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_mandate_suspended',
  'mandate-suspended',
  'SMS',
  NULL,
  'Xkimi Xa Mali Foundation: Your bank has suspended your debit order after several failed collections. Nothing more will be collected until you authorise it again. Contact us and we will help you restart it.'
)
ON CONFLICT ("slug") DO NOTHING;
