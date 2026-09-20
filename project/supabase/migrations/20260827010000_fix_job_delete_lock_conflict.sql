/*
  # Fix "Could not delete job: Column "job_id" cannot be changed after
    creation." — trg_lock_company_applications vs. deleting a job

  Same root cause and same fix shape as
  20260826080000_fix_message_edit_lock_conflict.sql, just for a different
  pair of triggers/tables.

  `company_applications.job_id` references `jobs(id)` with
  `ON DELETE SET NULL` — so deleting a job correctly triggers Postgres to
  clear `job_id` on any application that pointed at it, keeping that
  column from ever pointing at a deleted job.

  But 20260731110000_security_hardening.sql's `trg_lock_company_applications`
  (BEFORE UPDATE) included `job_id` in the list of columns that can NEVER
  change after a row is created — which blocks that very cleanup. The
  moment someone deletes a job that has any applications pointing at it,
  Postgres tries to null out `job_id` on those rows as part of the
  DELETE, `trg_lock_company_applications` sees `job_id` changing and
  raises "Column "job_id" cannot be changed after creation.", and the
  whole DELETE on `jobs` fails and rolls back — which is exactly the
  error surfaced in the app as "Could not delete job: ...". (This was
  silently swallowed before a recent app-side fix started actually
  checking/showing delete errors instead of assuming every delete
  succeeded — the bug itself isn't new, just newly visible.)

  Fix: re-create the trigger without `job_id` in the locked-columns list.
  A student's own submitted identity (name/contact/resume/etc.) still
  can't be tampered with after the fact — only `job_id`, which
  legitimately needs to become NULL when its job goes away, is no longer
  protected.

  Also (defensively, idempotent): ensure the FK this whole mechanism
  depends on actually exists, in case this environment's `job_id` column
  predates it being added.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'company_applications'
      AND kcu.column_name = 'job_id'
      AND ccu.table_name = 'jobs'
  ) THEN
    ALTER TABLE company_applications
      ADD CONSTRAINT company_applications_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_lock_company_applications ON company_applications;
CREATE TRIGGER trg_lock_company_applications
  BEFORE UPDATE ON company_applications
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'company_id,student_id,full_name,address,phone,email,resume_url,resume_filename'
  );
