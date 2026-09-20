-- Removes the placeholder/demo companies that were inserted by the initial
-- schema migration's seed block (Nimbus Labs, Quantum Systems, Vertex AI,
-- CloudForge, Pixel Studio, DataBridge, Nexus Corp, CyberEdge, GreenByte,
-- Stellar Dynamics). These were sample data for local development/demo
-- purposes and are not real recruiting companies.
--
-- `matches.company_id` and `company_applications`/`jobs` (via company_id ->
-- auth.users, not relevant here) reference companies with ON DELETE CASCADE,
-- so any matches generated against these demo companies are removed
-- automatically along with them.

DELETE FROM companies
WHERE name IN (
  'Nimbus Labs',
  'Quantum Systems',
  'Vertex AI',
  'CloudForge',
  'Pixel Studio',
  'DataBridge',
  'Nexus Corp',
  'CyberEdge',
  'GreenByte',
  'Stellar Dynamics'
);
