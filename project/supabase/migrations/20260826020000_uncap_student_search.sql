/*
  # Remove the 20-result cap on friend/student search

  `search_students` had a hard `LIMIT 20`, and the client-side fallback
  query in FriendsView.tsx had a matching `.limit(20)`. Together these
  meant that if more than 20 students matched a search term, only the
  first 20 (alphabetically) were ever shown — anyone past that cutoff
  was permanently unsearchable by name, no matter how specific the query
  got.

  This raises the cap to 1000 (effectively "no limit" for any real
  student body, while still guarding against a single query somehow
  returning an unbounded number of rows) and keeps results ordered by
  name so they're stable and predictable.
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
  LIMIT 1000;
$$;
