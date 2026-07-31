/*
  # Admin badge support

  Adds an `author_role` snapshot column (same pattern as the existing
  `author_name` column) to announcements, forum posts, and forum replies,
  so the UI can show an "Admin" badge next to a poster's name without an
  extra join. It's set once at insert time from the poster's profile role.
*/

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';
ALTER TABLE forum_replies ADD COLUMN IF NOT EXISTS author_role text DEFAULT '';
