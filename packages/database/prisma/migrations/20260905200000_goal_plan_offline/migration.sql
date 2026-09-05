-- Let a monthly goal plan exist without a collections provider behind it.
--
-- A plan was built as an instruction to a debit order: enrolment required an
-- active mandate, and the daily run PAUSED any plan whose mandate had gone. The
-- DebiCheck application was declined, so no member holds a mandate, so no member
-- could create a plan at all — the feature was offered in the app and refused
-- every attempt.
--
-- That was the wrong reading of what a plan is. A plan is a member's standing
-- commitment to a goal; a debit order was only ever one way of honouring it. The
-- other way is the way every other rand currently arrives: the member pays, and
-- an administrator records it.
--
-- So the monthly event becomes a REQUEST when nothing can collect, and this
-- column records that it was made. It is deliberately not the same column as
-- `lastCollectedPeriod`: one says money moved, the other says somebody was
-- asked, and a record that cannot tell those apart is not a money record.

ALTER TABLE "goal_plans" ADD COLUMN "lastRequestedPeriod" TEXT;

-- Tell a member what their plan asks for this month.
--
-- Sent on the plan's own day, in place of the collection that cannot happen. It
-- has to carry the amount and the goal, because unlike a debit the member is the
-- one who has to act on it.
--
-- SMS, matching every other goal-plan template: it is short, it is about money,
-- and it needs to arrive rather than be found.
--
-- Plain hyphens and no em dash. A single character outside GSM-7 bills the whole
-- message as UCS-2 and halves the character budget.
--
-- Seeded for fresh installs; inserted here for existing databases, because the
-- seed is create-only and editing templates.ts alone changes nothing in
-- production. Idempotent — the slug is unique, so re-running is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES (
  'tmpl_goal_plan_due',
  'goal-plan-due',
  'SMS',
  NULL,
  'Xkimi Xa Mali Foundation: Your monthly plan for "{{goal}}" asks for R{{amount}} this month. Pay it into the group account and send your proof of payment, and we will record it against the goal.'
)
ON CONFLICT ("slug") DO NOTHING;
