/*
  Fix: loadApplications() on the student side does a nested select
  `company_profiles(org_name, avatar_url)` on company_applications.
  PostgREST needs a direct FK to resolve that join. company_applications.company_id
  already references profiles(id); adding a second reference to company_profiles(id)
  lets the student see the company name + avatar on their Applications page.
  Every company that receives applications has a company_profiles row (created by
  becomeCompany()), so this is safe for existing data.
*/
ALTER TABLE company_applications
  ADD CONSTRAINT company_applications_company_profile_fk
  FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE;
