/*
  # Quiz system

  `quizzes` (company-owned) + `quiz_questions` (question text + options,
  readable by the company that owns it AND any student it's been assigned
  to) + `quiz_answer_keys` (correct_index, readable ONLY by the owning
  company — never by students, not even the assigned ones, so the answer
  can't be read by inspecting network requests). Scoring an attempt
  therefore has to happen server-side (see api/quiz-submit.ts), since the
  student's browser is never allowed to see the answer key.

  `quiz_assignments` is how a company "sends" a quiz to one specific
  student — it's the row a chat message's attachment_url points at
  (attachment_type = 'quiz'), so the quiz is delivered and taken inline in
  the DM thread. `quiz_attempts` holds the student's one graded attempt;
  only the server (service role) can insert/update it.

  (Company account activation itself is completely free — no payment
  table, no payment step. See api/company-activate.ts.)
*/

-- ============================================================
-- QUIZZES
-- ============================================================

CREATE TABLE IF NOT EXISTS quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- Created here (before quizzes' own SELECT policy below, and before
-- quiz_questions further down) because both of those policies need to
-- reference this table in an EXISTS clause — Postgres requires it to
-- already exist at CREATE POLICY time, not just by the time anyone queries.

CREATE TABLE IF NOT EXISTS quiz_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quiz_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quizzes" ON quizzes;
CREATE POLICY "select_quizzes" ON quizzes
  FOR SELECT TO authenticated USING (
    company_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.quiz_id = quizzes.id AND qa.student_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_quizzes" ON quizzes;
CREATE POLICY "insert_quizzes" ON quizzes
  FOR INSERT TO authenticated WITH CHECK (
    company_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'company')
  );

DROP POLICY IF EXISTS "update_quizzes" ON quizzes;
CREATE POLICY "update_quizzes" ON quizzes
  FOR UPDATE TO authenticated USING (company_id = auth.uid()) WITH CHECK (company_id = auth.uid());

DROP POLICY IF EXISTS "delete_quizzes" ON quizzes;
CREATE POLICY "delete_quizzes" ON quizzes
  FOR DELETE TO authenticated USING (company_id = auth.uid());

-- ---------- Questions (no answers in this table) ----------

CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_questions" ON quiz_questions;
CREATE POLICY "select_quiz_questions" ON quiz_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.quiz_id = quiz_questions.quiz_id AND qa.student_id = auth.uid())
    OR is_admin()
  );

DROP POLICY IF EXISTS "insert_quiz_questions" ON quiz_questions;
CREATE POLICY "insert_quiz_questions" ON quiz_questions
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_quiz_questions" ON quiz_questions;
CREATE POLICY "update_quiz_questions" ON quiz_questions
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_quiz_questions" ON quiz_questions;
CREATE POLICY "delete_quiz_questions" ON quiz_questions
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.company_id = auth.uid())
  );

-- ---------- Answer keys (owner-only, never student-readable) ----------

CREATE TABLE IF NOT EXISTS quiz_answer_keys (
  question_id uuid PRIMARY KEY REFERENCES quiz_questions(id) ON DELETE CASCADE,
  correct_index integer NOT NULL
);

ALTER TABLE quiz_answer_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "select_quiz_answer_keys" ON quiz_answer_keys
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
    OR is_admin()
  );
-- No student-facing SELECT policy at all — this table is only ever read by
-- the owning company (to edit the quiz) or the api/quiz-submit.ts server
-- function, which uses the service role and bypasses RLS entirely.

DROP POLICY IF EXISTS "insert_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "insert_quiz_answer_keys" ON quiz_answer_keys
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_quiz_answer_keys" ON quiz_answer_keys;
CREATE POLICY "update_quiz_answer_keys" ON quiz_answer_keys
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE qq.id = quiz_answer_keys.question_id AND q.company_id = auth.uid()
    )
  );

-- ============================================================
-- ASSIGNMENT POLICIES + ATTEMPTS
-- ============================================================
-- (quiz_assignments itself was created earlier, right after `quizzes`,
-- because quizzes' own SELECT policy needs to reference it — see above)

DROP POLICY IF EXISTS "select_quiz_assignments" ON quiz_assignments;
CREATE POLICY "select_quiz_assignments" ON quiz_assignments
  FOR SELECT TO authenticated USING (company_id = auth.uid() OR student_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "insert_quiz_assignments" ON quiz_assignments;
CREATE POLICY "insert_quiz_assignments" ON quiz_assignments
  FOR INSERT TO authenticated WITH CHECK (
    company_id = auth.uid()
    AND EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_assignments.quiz_id AND q.company_id = auth.uid())
  );

-- Only the status column may ever change after creation, and only by one
-- of the two real participants — everything else (who sent it, which quiz,
-- which DM message) is locked, reusing the same trigger pattern as
-- messages/friends/calls in the security-hardening migration.
DROP POLICY IF EXISTS "update_quiz_assignments" ON quiz_assignments;
CREATE POLICY "update_quiz_assignments" ON quiz_assignments
  FOR UPDATE TO authenticated
  USING (company_id = auth.uid() OR student_id = auth.uid())
  WITH CHECK (company_id = auth.uid() OR student_id = auth.uid());

DROP TRIGGER IF EXISTS trg_lock_quiz_assignments ON quiz_assignments;
CREATE TRIGGER trg_lock_quiz_assignments
  BEFORE UPDATE ON quiz_assignments
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns('quiz_id,company_id,student_id,message_id');

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL UNIQUE REFERENCES quiz_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quiz_attempts" ON quiz_attempts;
CREATE POLICY "select_quiz_attempts" ON quiz_attempts
  FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM quiz_assignments qa WHERE qa.id = quiz_attempts.assignment_id AND qa.company_id = auth.uid())
    OR is_admin()
  );
-- No INSERT/UPDATE policy for `authenticated` at all: every attempt is
-- graded and written by api/quiz-submit.ts using the service role, which
-- is what stops a student from just POSTing a fabricated 100% score.

-- ============================================================
-- MAINTENANCE MODE
-- ============================================================
-- Reuses the existing feature_flags system (see
-- 20260731090000_feature_flags_and_device_security.sql) so the admin app
-- needs zero code changes — its flags screen already lists/toggles any row
-- in this table generically. The main site checks this specific key to
-- show a full "down for maintenance" page instead of the app. Off by
-- default so this migration can't accidentally take the site down.
INSERT INTO feature_flags (key, name, description, category)
VALUES ('maintenance_mode', 'Maintenance Mode', 'Shows a "down for maintenance" page to everyone on the student/company site', 'system')
ON CONFLICT (key) DO NOTHING;
