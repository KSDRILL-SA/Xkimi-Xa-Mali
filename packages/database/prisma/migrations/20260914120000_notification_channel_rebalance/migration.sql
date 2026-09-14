-- Email counterparts for member news that only ever had an SMS template.
--
-- SMS is the one notification channel with a hard, paid quota (a few hundred
-- credits total). Every one of these events — a goal plan ending, badge tier
-- news, a goal missing its target — was reachable only by SMS, with no email
-- fallback, even though none of it is money moving or a deadline to act on.
-- The call sites that used to queue the SMS slug below now queue this email
-- slug instead; see badge.service.ts, goal-plan.service.ts,
-- goal-payment.service.ts, and goal-deadline-checker.ts.
--
-- Seeded for fresh installs in templates.ts; inserted here for existing
-- databases, because the seed is create-only and editing templates.ts alone
-- changes nothing in production. Idempotent — slugs are unique, so re-running
-- is a no-op.

INSERT INTO "notification_templates" ("id", "slug", "channel", "subject", "body")
VALUES
  (
    'tmpl_badge_level_down_email',
    'badge-level-down-email',
    'EMAIL',
    'Your badge tier has changed — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, your badge tier has changed to {{tier}}. Keep contributing on time to climb back up.'
  ),
  (
    'tmpl_goal_payment_thanks_email',
    'goal-payment-thanks-email',
    'EMAIL',
    'Thank you for your goal contribution — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, thank you! Your R{{amount}} toward "{{goal}}" has been received — your badge points just got a boost.'
  ),
  (
    'tmpl_goal_plan_completed_email',
    'goal-plan-completed-email',
    'EMAIL',
    'Your goal plan has ended — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, your monthly plan for "{{goal}}" has ended. {{reason}}. Nothing further will be collected for it.'
  ),
  (
    'tmpl_goal_plan_due_email',
    'goal-plan-due-email',
    'EMAIL',
    'Your goal plan asks for a payment this month — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, your monthly plan for "{{goal}}" asks for R{{amount}} this month. Pay it into the group account and send your proof of payment, and we will record it against the goal.'
  ),
  (
    'tmpl_goal_plan_paused_email',
    'goal-plan-paused-email',
    'EMAIL',
    'Your goal plan is paused — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, your monthly plan for "{{goal}}" is paused — we could not find an active debit order to collect from. Set one up and you can resume it.'
  ),
  (
    'tmpl_goal_failed_email',
    'goal-failed-email',
    'EMAIL',
    'A goal did not reach its target — Xkimi Xa Mali Foundation',
    'Hi {{firstName}}, "{{goal}}" did not reach its target by its deadline and has been marked Failed. No funds were released — nothing has left the pool. View it here: {{url}}'
  )
ON CONFLICT ("slug") DO NOTHING;
