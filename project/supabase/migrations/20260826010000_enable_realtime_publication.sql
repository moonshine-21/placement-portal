/*
  # Make sure Realtime is actually turned on for every table the app
  listens to with `.on('postgres_changes', ...)`

  Supabase only pushes `postgres_changes` events for a table once that
  table has been added to the `supabase_realtime` publication — this is
  a separate step from creating the table/RLS policies, and is normally
  done with a toggle in the Table Editor UI (Database → Replication) OR,
  as here, with `ALTER PUBLICATION ... ADD TABLE`. If it was never
  toggled on for a given project (e.g. a fresh project created from this
  SQL file alone, or via the CLI/migrations only, without ever visiting
  that screen), every `.on('postgres_changes', ...)` subscription in the
  app silently never fires — no error, the channel just never gets an
  event.

  This mattered most for calls: the CALLER side of CallManager.tsx only
  transitions from the "Ringing…" screen to the active call UI by
  listening for the `calls` row's status flipping to 'accepted' via
  `postgres_changes`. Without Realtime enabled on `calls`, a caller could
  ring forever even after the other person hits Accept. `friends` and
  `notifications` have the same dependency (live friend-request/
  notification updates).

  `ADD TABLE` throws if the table's already in the publication, so each
  is wrapped in a guard that only adds it if it's missing — safe to run
  repeatedly / already-applied.
*/

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calls', 'friends', 'notifications', 'messages']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
