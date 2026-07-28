// Vercel serverless function: mints a Daily.co meeting token for a call.
// Lives at /api/daily-call (Vercel auto-routes anything in /api).
//
// Required environment variables (set in Vercel → Settings → Environment Variables):
//   DAILY_API_KEY   — Daily.co REST API key
//   DAILY_DOMAIN    — your Daily.co subdomain (e.g. "acme" for acme.daily.co)
//   SUPABASE_URL    — your Supabase project URL
//   SUPABASE_ANON_KEY — your Supabase anon/public key
//
// This function intentionally uses the ANON key with the caller's access_token
// in the Authorization header, so Supabase RLS confirms the caller is a real
// participant (caller_id or callee_id) of the call row. It never uses the
// service-role key.

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { call_id, access_token, user_name } = req.body || {};
  if (!call_id || !access_token) {
    return res.status(400).json({ error: "Missing 'call_id' or 'access_token'" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const dailyApiKey = process.env.DAILY_API_KEY;
  const dailyDomain = process.env.DAILY_DOMAIN;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: "Server is missing Supabase configuration." });
  }
  if (!dailyApiKey || !dailyDomain) {
    return res.status(500).json({ error: "Server is missing Daily.co configuration. Set DAILY_API_KEY and DAILY_DOMAIN." });
  }

  // Create a Supabase client that carries the caller's access token, so RLS
  // enforces that they are a participant of this call row.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${access_token}` } },
  });

  const { data: callRow, error: fetchErr } = await supabase
    .from("calls")
    .select("id, room_name, status")
    .eq("id", call_id)
    .maybeSingle();

  if (fetchErr || !callRow) {
    // RLS blocks anyone who isn't caller_id or callee_id, so this is a 403.
    return res.status(403).json({ error: "You are not a participant of this call." });
  }

  const roomName = callRow.room_name;
  const roomUrl = `https://${dailyDomain}.daily.co/${roomName}`;

  // 1. Create the room if it doesn't exist. A 409 ("room already exists") is fine.
  const exp = Math.floor(Date.now() / 1000) + 60 * 60; // room expires in 1 hour
  try {
    const createRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: { exp, enable_chat: false, start_video_off: false, start_audio_off: false },
      }),
    });
    if (!createRes.ok && createRes.status !== 409) {
      const errText = await createRes.text();
      console.error("Daily room create failed:", createRes.status, errText);
      return res.status(502).json({ error: "Could not create call room.", detail: errText.slice(0, 200) });
    }
  } catch (err) {
    console.error("Daily room create error:", err);
    return res.status(502).json({ error: "Could not reach Daily.co.", detail: err.message });
  }

  // 2. Mint a meeting token for this user for that room.
  try {
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        properties: { room_name: roomName, user_name: user_name || "Guest", exp },
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Daily token mint failed:", tokenRes.status, errText);
      return res.status(502).json({ error: "Could not mint call token.", detail: errText.slice(0, 200) });
    }
    const tokenData = await tokenRes.json();
    return res.status(200).json({ token: tokenData.token, room_url: roomUrl });
  } catch (err) {
    console.error("Daily token mint error:", err);
    return res.status(502).json({ error: "Could not reach Daily.co.", detail: err.message });
  }
}
