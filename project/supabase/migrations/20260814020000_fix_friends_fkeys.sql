/*
  # Fix `friends` foreign keys so requests actually show up

  `friends.requester_id` and `friends.recipient_id` were only ever set up
  as `REFERENCES auth.users(id)` (see 20260730154708_create_complete_schema.sql).
  `profiles.id` ALSO references `auth.users(id)` — but `friends` and
  `profiles` never had a foreign key pointing directly at EACH OTHER.

  That matters because `src/views/FriendsView.tsx` asks Supabase to fetch
  `friends` rows with the other person's profile embedded, using:
    .select('..., profiles!friends_requester_id_fkey(full_name, ...)')

  PostgREST can only resolve that kind of embed when there's a real
  foreign key constraint directly between the two tables named in the
  query (`friends` and `profiles` here). Since `friends_requester_id_fkey`
  actually points at `auth.users`, not `profiles`, PostgREST can't
  resolve it — the query fails, and the calling code only checks
  `.data || []`, so it silently falls back to an empty list instead of
  surfacing the error. Sending a request still worked fine (a plain
  insert needs no join), but neither person would ever SEE it in
  Incoming/Outgoing/Friends — which is exactly the "friend requests
  don't work" bug.

  The fix: point requester_id/recipient_id at `profiles(id)` instead of
  `auth.users(id)`. This is safe — every `profiles.id` IS an
  `auth.users.id` (profiles.id itself references auth.users with
  ON DELETE CASCADE), and every friends row was always created for a
  signed-up user who has a profile — so no existing data can violate
  the new constraint. Re-creating the constraints with their original
  (Postgres auto-generated) names means the app code doesn't need to
  change at all.
*/

ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_requester_id_fkey;
ALTER TABLE friends
  ADD CONSTRAINT friends_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE friends DROP CONSTRAINT IF EXISTS friends_recipient_id_fkey;
ALTER TABLE friends
  ADD CONSTRAINT friends_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES profiles(id) ON DELETE CASCADE;
