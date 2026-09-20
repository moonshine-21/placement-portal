/*
  # Fix "Database error deleting user" for good

  Account deletion deletes the auth.users row, which cascades through every
  table that references the user. Some of those cascades are ON DELETE SET NULL
  (quiz_assignments.message_id, company_applications.job_id, ...), which Postgres
  performs as an UPDATE on the child row. `lock_immutable_columns` (the
  "this column can never change" guard) then blocked that UPDATE and the whole
  deletion rolled back with a generic "Database error deleting user".

  This has now bitten three times (message edit, job delete, quiz assignment),
  each time fixed by removing one column from one trigger. This migration:

  1. Makes `lock_immutable_columns` ignore UPDATEs that are fired by another
     trigger / foreign-key action (pg_trigger_depth() > 1). A direct client
     UPDATE runs at depth 1 and is still fully protected; a cascade runs
     nested (depth 2) and is allowed. This fixes the whole class of bug.
  2. Re-creates the three triggers involved without the FK columns that
     legitimately get nulled (idempotent — safe even if the earlier fix
     migrations were never applied to this database).
*/

CREATE OR REPLACE FUNCTION lock_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  col text;
  cols text[];
BEGIN
  -- Fired from inside another trigger (e.g. an ON DELETE SET NULL / CASCADE
  -- referential action)? Not a user edit — let it through.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  cols := string_to_array(TG_ARGV[0], ',');
  FOREACH col IN ARRAY cols LOOP
    IF to_jsonb(NEW) ->> col IS DISTINCT FROM to_jsonb(OLD) ->> col THEN
      RAISE EXCEPTION 'Column "%" cannot be changed after creation.', col;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_company_applications ON company_applications;
CREATE TRIGGER trg_lock_company_applications
  BEFORE UPDATE ON company_applications
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'company_id,student_id,full_name,address,phone,email,resume_url,resume_filename'
  );

DROP TRIGGER IF EXISTS trg_lock_quiz_assignments ON quiz_assignments;
CREATE TRIGGER trg_lock_quiz_assignments
  BEFORE UPDATE ON quiz_assignments
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns('quiz_id,company_id,student_id');

DROP TRIGGER IF EXISTS trg_lock_messages ON messages;
CREATE TRIGGER trg_lock_messages
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns('conversation_id,sender_id');
