/*
  # Stop leaking student emails from friend search

  `search_students` previously returned each matching student's email address,
  which was rendered directly in the "Find Friends" search results — visible
  to any logged-in user who searched for someone by name. Emails should be
  private; drop the column from the RPC's return type (return `branch`
  instead, which is actually useful context in a search result) and swap the
  return type since Postgres won't let CREATE OR REPLACE change output columns.
*/

DROP FUNCTION IF EXISTS search_students(text);

CREATE FUNCTION search_students(q text)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  branch text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, full_name, avatar_url, branch
  FROM profiles
  WHERE (role = 'student' OR role IS NULL)
    AND full_name ILIKE '%' || q || '%'
  ORDER BY full_name
  LIMIT 20;
$$;
