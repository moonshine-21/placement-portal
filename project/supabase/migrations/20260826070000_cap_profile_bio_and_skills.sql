/*
  # Cap bio length and skill count on profiles

  A profile with an extremely long bio or an unbounded number of skills was
  making the profile card/popover (ProfileCardModal.tsx, the header's own
  profile dropdown) grow to an unusable size. The client now enforces a
  1000-character bio limit and a 40-skill limit at input time
  (ProfileView.tsx), but that alone doesn't stop a direct API call from
  writing past those limits — this adds the same caps as real database
  constraints so they hold no matter how the row gets written.

  Any existing row that already exceeds either limit is trimmed once here
  so the constraint can actually be added.
*/

UPDATE profiles SET bio = left(bio, 1000) WHERE bio IS NOT NULL AND length(bio) > 1000;
UPDATE profiles SET skills = skills[1:40] WHERE skills IS NOT NULL AND array_length(skills, 1) > 40;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_bio_length_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length_check CHECK (bio IS NULL OR length(bio) <= 1000);

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_skills_count_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_skills_count_check CHECK (skills IS NULL OR array_length(skills, 1) <= 40);
