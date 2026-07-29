/*
# Allow profile visibility between friends / friend-requesters / call peers

## Problem
`profiles` SELECT policy only allows a user to read their own row (or an
admin to read all rows):

    USING (auth.uid() = id OR public.is_admin())

The Friends tab and calling feature both join/lookup *other* users'
`full_name` / `avatar_url` (incoming requests, outgoing requests, accepted
friends list, incoming/outgoing call screens). Under the old policy those
lookups are silently filtered out by RLS, so names/avatars never show up
even once the query itself succeeds.

## Fix
Add an additional SELECT policy (policies are OR'd together) that also
allows reading a profile when the requester has a `friends` row with that
person (pending or accepted, either direction) or a `calls` row with them
(either direction). This keeps visibility scoped to people you've actually
interacted with via friend requests or calls, rather than opening the whole
table.
*/

DROP POLICY IF EXISTS "select_related_profiles" ON profiles;
CREATE POLICY "select_related_profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM friends f
      WHERE (f.requester_id = auth.uid() AND f.recipient_id = profiles.id)
         OR (f.recipient_id = auth.uid() AND f.requester_id = profiles.id)
    )
    OR EXISTS (
      SELECT 1 FROM calls c
      WHERE (c.caller_id = auth.uid() AND c.callee_id = profiles.id)
         OR (c.callee_id = auth.uid() AND c.caller_id = profiles.id)
    )
  );
