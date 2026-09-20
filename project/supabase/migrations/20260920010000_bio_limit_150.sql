/*
  # Tighten profile bio limit to 150 characters

  Replaces the earlier 1000-character cap. Existing bios longer than 150
  characters are trimmed once here so the new constraint can be added.
  The client (ProfileView.tsx, AdminViews.tsx) enforces the same limit.
*/

UPDATE profiles SET bio = left(bio, 150) WHERE bio IS NOT NULL AND length(bio) > 150;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_length_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length_check CHECK (bio IS NULL OR length(bio) <= 150);
