/*
# Jobs table + application status updates
*/

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  skills_required text[] NOT NULL DEFAULT '{}',
  package_lpa numeric(5,2) NOT NULL DEFAULT 0.0,
  employees_needed integer NOT NULL DEFAULT 0,
  employees_have integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_jobs" ON jobs;
CREATE POLICY "read_jobs"
  ON jobs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs"
  ON jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs"
  ON jobs FOR UPDATE TO authenticated
  USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs"
  ON jobs FOR DELETE TO authenticated
  USING (auth.uid() = company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);

-- Add job_id to company_applications (optional link to a specific job)
ALTER TABLE company_applications ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE SET NULL;

-- Expand the status check to include 'hired' and 'pending'
ALTER TABLE company_applications DROP CONSTRAINT IF EXISTS company_applications_status_check;
ALTER TABLE company_applications ADD CONSTRAINT company_applications_status_check
  CHECK (status IN ('submitted','pending','viewed','shortlisted','rejected','hired'));

-- Add realtime for jobs and company_applications
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'company_applications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE company_applications;
    END IF;
  END IF;
END $$;
