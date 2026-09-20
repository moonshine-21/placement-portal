/*
  # Let a user delete their own DMs

  `messages` had SELECT/INSERT/UPDATE policies but no DELETE policy at
  all, so deleting a message was silently rejected by RLS no matter what
  the UI tried to do. This adds a DELETE policy scoped strictly to
  `sender_id = auth.uid()` — you can only delete messages YOU sent,
  never a message the other person sent you.
*/

DROP POLICY IF EXISTS "delete_own_messages" ON messages;
CREATE POLICY "delete_own_messages" ON messages FOR DELETE TO authenticated USING (
  auth.uid() = sender_id
);
