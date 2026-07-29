/*
# Authorize the call-signaling Realtime channel (fixes calls stuck on "Connecting…")

## Problem
The voice/video calling feature signals WebRTC offers, answers, and ICE
candidates over a Supabase Realtime Broadcast/Presence channel named
`call-<call id>` (see prepareCall() in frontend/js/app.js). Supabase Realtime
now enforces Authorization on Broadcast and Presence channels by default:
unless a channel is explicitly opened as `private: true` AND matching RLS
policies exist on `realtime.messages`, the server silently drops every
broadcast sent on that channel.

That's exactly why calls appeared to "ring", the callee could accept, but
the two sides never actually connected: the offer/answer/ICE-candidate
messages that make WebRTC work were being thrown away before they ever
reached the other browser. No error was thrown client-side because
Broadcast sends are fire-and-forget.

## Fix
Add SELECT (read) and INSERT (write) policies on `realtime.messages` scoped
to the two people on a given `calls` row, using `realtime.topic()` to
recover which call the client is trying to join. Only the caller or callee
of that specific call — matched by the `call-<id>` topic name — can send or
receive on that channel.

This pairs with the `private: true` flag added to the `supabase.channel(...)`
call in prepareCall() on the frontend; without both halves of this fix,
signaling still won't be authorized.
*/

DROP POLICY IF EXISTS "call_signaling_read" ON realtime.messages;
CREATE POLICY "call_signaling_read"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM calls c
      WHERE realtime.topic() = 'call-' || c.id::text
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "call_signaling_write" ON realtime.messages;
CREATE POLICY "call_signaling_write"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1 FROM calls c
      WHERE realtime.topic() = 'call-' || c.id::text
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );
