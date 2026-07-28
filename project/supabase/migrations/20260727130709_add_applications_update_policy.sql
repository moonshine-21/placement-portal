/*
# Add missing UPDATE policy on applications

The `applyToCompany()` client uses `.upsert()` on the `applications` table.
Upsert = INSERT on conflict → UPDATE. The table had INSERT and DELETE
policies but no UPDATE policy, so re-applying to the same company (or any
upsert that hit the UNIQUE constraint) was silently blocked by RLS.
*/

DROP POLICY IF EXISTS "update_own_applications" ON applications;
CREATE POLICY "update_own_applications"
  ON applications FOR UPDATE TO authenticated
  USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);
