/*
  # Let a user edit their own DMs

  Adds an `edited_at` timestamp so the UI can show an "(edited)" label,
  exactly like Instagram does.

  The existing `update_messages` RLS policy is broader than we want for
  this: it lets EITHER participant in a conversation UPDATE a message
  row (that's needed so the recipient can stamp `read_at` when they read
  it), with `WITH CHECK (true)` placing no limit on what a participant
  can change. That's fine for `read_at`, but it would also let the
  *recipient* silently rewrite the *sender's* message body, which is not
  what "edit your own message" should allow.

  Rather than fight that with more RLS policies (Postgres RLS can't
  easily express "this column only if you're X, that column only if
  you're Y" on the same UPDATE), this adds a BEFORE UPDATE trigger that
  rejects any change to `body`, `attachment_url`, `attachment_name`, or
  `attachment_type` unless the person making the change is the original
  sender. `read_at` (and now `edited_at`) stay editable by either side.
*/

ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT NULL;

CREATE OR REPLACE FUNCTION prevent_message_content_edit_by_non_sender()
RETURNS trigger AS $$
BEGIN
  IF (
    NEW.body IS DISTINCT FROM OLD.body
    OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
    OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
    OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
  ) AND auth.uid() IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'Only the sender can edit this message';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_message_content_edit_by_non_sender ON messages;
CREATE TRIGGER trg_prevent_message_content_edit_by_non_sender
BEFORE UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION prevent_message_content_edit_by_non_sender();
