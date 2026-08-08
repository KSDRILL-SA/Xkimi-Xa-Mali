-- When a password was last set under the current strength policy.
--
-- Registration enforced eight characters with one uppercase and one digit,
-- while `RegisterSchema` — the schema the route never used — required twelve
-- and carried a comment arguing against precisely the rule the route applied:
-- "eight with a capital and a digit bolted on, which in practice produces
-- Password1, the shape attackers try first". Password reset and change both
-- used the twelve-character schema. So the weakest passwords in the system were
-- the ones every account was created with, and they were the only ones never
-- held to the policy.
--
-- NULL is deliberate and is the whole point of the column: every existing row
-- keeps it, marking a password set under the old rule. Nothing is backfilled,
-- because a backfilled timestamp would claim compliance no one verified.
--
-- Additive and inert on its own. Nothing reads this column unless
-- REQUIRE_PASSWORD_POLICY_RESET is turned on, which is an owner decision taken
-- after the founders have been told — not a consequence of deploying.

ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
