/*
  Remove fake seed companies and their dependent rows.
*/

-- Remove matches that reference the fake companies.
DELETE FROM matches
  WHERE company_id IN (SELECT id FROM companies WHERE name IN (
    'Nimbus Labs','Quanta Cloud','Vertex AI','Lumen Pay',
    'Drift Studio','Forge Systems','Cobalt HR'
  ));

-- Remove applications to those fake companies.
DELETE FROM applications
  WHERE company_id IN (SELECT id FROM companies WHERE name IN (
    'Nimbus Labs','Quanta Cloud','Vertex AI','Lumen Pay',
    'Drift Studio','Forge Systems','Cobalt HR'
  ));

-- Finally remove the fake companies themselves.
DELETE FROM companies
  WHERE name IN (
    'Nimbus Labs','Quanta Cloud','Vertex AI','Lumen Pay',
    'Drift Studio','Forge Systems','Cobalt HR'
  );