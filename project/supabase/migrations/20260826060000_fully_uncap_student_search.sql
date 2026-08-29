/*
  # Actually uncap friend/student search (fix the 1000-result ceiling)

  20260826020000_uncap_student_search.sql raised the search cap from 20 to
  1000 — an improvement, but still a hard ceiling: on a large student body,
  anyone alphabetically past the first 1000 matches was still permanently
  unsearchable by name. This removes the LIMIT from search_students
  entirely, so the database itself no longer caps how many rows can come
  back for a search.

  IMPORTANT — this alone is NOT the whole fix. Supabase's REST layer
  (PostgREST) also enforces its own project-wide "Max Rows" setting
  (Project Settings → API → Max Rows, default 1000) on every request,
  including RPC calls like this one — that setting lives in your Supabase
  dashboard, not in SQL, so no migration can change it. To get truly
  unlimited results, raise or clear that Max Rows setting in the
  dashboard too (or leave it high enough to comfortably exceed your real
  student count).
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
  ORDER BY full_name;
$$;
