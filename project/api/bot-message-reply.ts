// Vercel Serverless Function — POST /api/bot-message-reply
//
// Called by the client (fire-and-forget, right after MessagesView.sendMessage
// inserts a message into a conversation whose other participant is a bot
// company). Generates an in-character reply via Gemini and posts it as that
// bot — the client never writes messages "as" the bot itself (RLS forbids
// sender_id != auth.uid() anyway), so this is the only place a bot's DM
// replies get written.

import { adminClient, resolveCaller } from './_lib/callerAuth.js';
import { getBotPersona, sendBotMessage } from './_lib/bots.js';
import { generateText } from './_lib/gemini.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const rl = rateLimit(`bot-message-reply:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  const admin = adminClient();
  if (!admin) return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 });

  const caller = await resolveCaller(req, admin);
  if (!caller) return new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 });

  let body: { conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  const conversationId = body.conversationId;
  if (!conversationId) return new Response(JSON.stringify({ error: 'Missing conversationId' }), { status: 400 });

  const { data: conv } = await admin.from('conversations').select('id, user_a, user_b').eq('id', conversationId).maybeSingle();
  if (!conv) return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
  if (conv.user_a !== caller.id && conv.user_b !== caller.id) {
    return new Response(JSON.stringify({ error: 'Not a participant in this conversation' }), { status: 403 });
  }
  const otherId = conv.user_a === caller.id ? conv.user_b : conv.user_a;

  const persona = await getBotPersona(admin, otherId);
  if (!persona) {
    // Other participant isn't a bot — nothing to do (this is the normal
    // case for every human-to-human conversation, not an error).
    return new Response(JSON.stringify({ ok: true, replied: false }), { status: 200 });
  }

  // Per-conversation limit too, since the global IP limit above is shared
  // across every bot conversation a user has open.
  const rl2 = rateLimit(`bot-message-reply:conv:${conversationId}`, 15, 60_000);
  if (!rl2.allowed) {
    return new Response(JSON.stringify({ ok: true, replied: false, note: 'conversation rate-limited' }), { status: 200 });
  }

  const { data: recentRows } = await admin
    .from('messages')
    .select('sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12);
  const recent = (recentRows || []).slice().reverse();

  const { data: studentProfile } = await admin
    .from('profiles')
    .select('full_name, branch, skills')
    .eq('id', caller.id)
    .maybeSingle();

  const transcript = recent
    .map((m) => `${m.sender_id === otherId ? persona.org_name : (studentProfile?.full_name || 'Candidate')}: ${m.body}`)
    .join('\n');

  const prompt = `You are ${persona.org_name}, a company recruiter chatting on a campus placement platform's DM inbox. Stay fully in character as this company's recruiting team — never say you're an AI or a bot.

Company industry: ${persona.industry || 'general'}
Company description: ${persona.about_us || 'n/a'}
Candidate: ${studentProfile?.full_name || 'Candidate'} (branch: ${studentProfile?.branch || 'n/a'}, skills: ${(studentProfile?.skills || []).join(', ') || 'none listed'})

Conversation so far:
${transcript}

Write only ${persona.org_name}'s next reply — 1 to 4 sentences, natural and conversational, professional but warm, matching a real recruiter texting back. No markdown, no headers, no signing off with a name/title unless it fits naturally.`;

  const reply = await generateText(prompt, { temperature: 0.85, maxOutputTokens: 300 });
  if (!reply) {
    // Gemini exhausted/misconfigured — silently skip rather than post a
    // fake or broken reply. The student just sees no response this time.
    return new Response(JSON.stringify({ ok: true, replied: false, note: 'generation failed' }), { status: 200 });
  }

  const { error } = await sendBotMessage(admin, otherId, caller.id, reply, {
    notifyTitle: `New message from ${persona.org_name}`,
  });
  if (error) {
    console.error('[bot-message-reply] failed to send:', error);
    return new Response(JSON.stringify({ error: 'Could not send reply' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, replied: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
