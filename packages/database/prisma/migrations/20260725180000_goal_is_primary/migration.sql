-- Designate the primary yearly goal — the common fund every monthly
-- contribution flows into. At most one goal may be primary at a time, enforced
-- by a partial unique index: every primary row shares the value TRUE, so the
-- unique constraint permits only one.

ALTER TABLE "goals" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "goals_one_primary" ON "goals" ("isPrimary") WHERE "isPrimary";
