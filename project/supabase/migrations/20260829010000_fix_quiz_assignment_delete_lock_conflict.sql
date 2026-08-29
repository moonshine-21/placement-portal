/*
  # Fix "Database error deleting user" — trg_lock_quiz_assignments vs.
    deleting a message (incl. via account deletion)

  Same root cause and same fix shape as
  20260827010000_fix_job_delete_lock_conflict.sql, just for a different
  pair of triggers/tables.

  `quiz_assignments.message_id` references `messages(id)` with
  `ON DELETE SET NULL` — so deleting a message correctly triggers Postgres
  to clear `message_id` on any quiz assignment that pointed at it.

  But 20260803120000_quiz_system.sql's `trg_lock_quiz_assignments`
  (BEFORE UPDATE) included `message_id` in the list of columns that can
  NEVER change after a row is created — which blocks that very cleanup.
  The moment a message tied to a quiz assignment is deleted, Postgres
  tries to null out `message_id` on that row as part of the DELETE,
  `trg_lock_quiz_assignments` sees `message_id` changing and raises
  "Column \"message_id\" cannot be changed after creation.", and the whole
  DELETE on `messages` fails and rolls back.

  This is exactly what account deletion hits: `api/account-delete.ts`
  deletes the `auth.users` row, which cascades to delete every message the
  person ever sent (`messages.sender_id ... ON DELETE CASCADE`). If any of
  those messages was ever linked to a quiz assignment, the cascade dies
  here, Postgres reports it back as a generic "Database error deleting
  user", and the whole account deletion fails — for ANY account that ever
  sent a quiz-linked message, not just the quiz's own company/student.

  Fix: re-create the trigger without `message_id` in the locked-columns
  list. `quiz_id`, `company_id`, and `student_id` — the actual identity of
  who the assignment is between and for which quiz — still can't be
  tampered with after the fact; only `message_id`, which legitimately
  needs to become NULL when its message goes away, is no longer protected.
*/

DROP TRIGGER IF EXISTS trg_lock_quiz_assignments ON quiz_assignments;
CREATE TRIGGER trg_lock_quiz_assignments
  BEFORE UPDATE ON quiz_assignments
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns('quiz_id,company_id,student_id');
