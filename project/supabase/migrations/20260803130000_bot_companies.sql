/*
  # AI-run ("bot") companies

  Adds a single `is_bot` flag to `company_profiles`. A bot company is a
  completely normal company account under the hood — same auth.users row,
  same profiles/company_profiles/jobs/company_applications rows as a real
  recruiter would have — just one whose replies, hiring decisions, quizzes,
  and job postings are generated and written server-side (via the service
  role, see api/bot-*.ts) instead of a human clicking buttons.

  This is deliberately the ONLY schema change needed: every other table
  (jobs, messages, conversations, company_applications, quizzes, …) already
  works for any company_id, bot or not, because a bot IS a real company
  account. `is_bot` just tells the client whether to show an "AI Recruiter"
  badge, and tells the bot-* endpoints which accounts they're allowed to
  act as.
*/

ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Small and rarely queried by anything other than "give me all the bots",
-- so a partial index (only bot rows) is enough.
CREATE INDEX IF NOT EXISTS idx_company_profiles_is_bot ON company_profiles(is_bot) WHERE is_bot = true;
