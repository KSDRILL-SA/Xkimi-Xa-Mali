-- Make the audit log actually append-only.
--
-- The compliance pack has been claiming this for some time. `popia-compliance.md`
-- tells a regulator that every administrative action "writes to the same
-- append-only audit log ... which a spreadsheet cannot offer"; the constitution
-- forbids the log's deletion; and the restore runbook's verification step 8 says
-- to "confirm the constraint survived".
--
-- There was no constraint. A restore drill on 2026-08-15 ran an UPDATE and a
-- DELETE against `audit_logs` as the ordinary application role and both
-- succeeded — one row rewritten to a different action, another removed. No
-- trigger, no rule, no row-level security. The property was real only in the
-- sense that no code happened to do it: `auditLog.create` is the single call
-- anywhere in either app, and nothing updates or deletes.
--
-- That is a convention, not a guarantee, and the difference is the whole reason
-- the log is offered as better than a spreadsheet. A spreadsheet is also
-- append-only as long as nobody edits it.
--
-- So the guarantee moves into the database, where it holds regardless of what
-- any future code does. INSERT is untouched.
--
-- What this deliberately does NOT defend against: the database owner or a
-- superuser, who can drop this trigger. Nothing inside Postgres can stop the
-- role that owns the schema, and pretending otherwise would be its own kind of
-- dishonesty. What it does close is every accidental path — a stray migration, a
-- mistaken `deleteMany`, an ORM cascade — and the ordinary application role,
-- which is what actually reaches this table day to day.

CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'audit_logs is append-only: % is not permitted (see docs/compliance/popia-compliance.md)',
    TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- FOR EACH STATEMENT, not FOR EACH ROW: an UPDATE or DELETE matching no rows is
-- still an attempt, and refusing it is cheaper than walking rows to refuse each.
DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON "audit_logs";
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_append_only();
