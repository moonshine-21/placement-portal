/*
  # Fix "Could not edit message" — trg_lock_messages vs. trg_prevent_message_content_edit_by_non_sender

  20260731110000_security_hardening.sql created `trg_lock_messages`, which
  unconditionally rejects any change to `body` (and the attachment
  columns) on the `messages` table, for anyone, forever.

  20260826050000_allow_edit_own_messages.sql later added
  `trg_prevent_message_content_edit_by_non_sender`, meant to let the
  ORIGINAL SENDER edit `body`/attachment columns while blocking everyone
  else.

  Both triggers fire BEFORE UPDATE. `trg_lock_messages` runs first
  (alphabetical trigger ordering: 'trg_lock_messages' < 'trg_prevent...')
  and raises its own exception on any `body` change before the
  sender-aware trigger ever gets a chance to allow it — so editing a
  message has been failing for every user, sender or not, ever since.
  That's the "Could not edit message" toast in the UI.

  Fix: re-create `trg_lock_messages` on `messages` so it only locks the
  columns that should truly never change after creation
  (`conversation_id`, `sender_id`). Content/attachment mutability is
  already correctly governed by `trg_prevent_message_content_edit_by_non_sender`,
  which still enforces "only the sender may change body/attachments."
*/

DROP TRIGGER IF EXISTS trg_lock_messages ON messages;
CREATE TRIGGER trg_lock_messages
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION lock_immutable_columns(
    'conversation_id,sender_id'
  );
