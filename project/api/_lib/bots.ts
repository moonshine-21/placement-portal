// ============================================================================
// api/_lib/bots.ts
//
// WHAT THIS FILE IS: shared helpers used by every "bot company" endpoint
// (api/bot-message-reply.ts, api/bot-evaluate-application.ts,
// api/bot-rotate-jobs.ts). A "bot company" is a completely normal company
// account under the hood — it just has `is_bot = true` set on its
// company_profiles row, and instead of a real person clicking buttons,
// these server functions write messages/decisions/jobs on its behalf.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// The handful of details about a bot company needed to have Gemini "act"
// as it convincingly — its name, industry, description, and what skills
// it typically hires for.
export type BotPersona = {
  id: string;
  org_name: string;
  industry: string;
  about_us: string;
  skills_required: string[];
};

// Looks up a company by ID and returns its persona details — but ONLY if
// it's actually flagged as a bot. If the ID belongs to a real (human-run)
// company, or doesn't exist at all, this returns `null`. Every bot
// endpoint calls this first and stops immediately if it gets `null` back
// — this is the single gatekeeping check that prevents these endpoints
// from ever being tricked into acting on behalf of a real company.
export async function getBotPersona(admin: SupabaseClient, companyId: string): Promise<BotPersona | null> {
  const { data } = await admin
    .from('company_profiles')
    .select('id, org_name, industry, about_us, skills_required, is_bot')
    .eq('id', companyId)
    .maybeSingle();
  if (!data || !data.is_bot) return null;
  return data as BotPersona;
}

// Finds (or opens) the DM conversation between a bot company and a
// student, then posts a message as the bot — the exact same shape
// src/lib/quiz.ts's sendQuizToStudent uses client-side, just running here
// under the service role so it can write sender_id = the bot's id (RLS
// requires sender_id = auth.uid(), which is never true for a server call).
//
//   admin      — a full-access database connection (see callerAuth.ts's adminClient)
//   botId      — the bot company's account ID (the message's sender)
//   studentId  — who the bot is messaging
//   body       — the message text
//   opts       — everything optional: a file/quiz attachment, a custom
//                conversation-list preview text, and/or a bell-notification title
export async function sendBotMessage(
  admin: SupabaseClient,
  botId: string,
  studentId: string,
  body: string,
  opts: { attachmentUrl?: string; attachmentName?: string; attachmentType?: string; lastMessagePreview?: string; notifyTitle?: string } = {}
): Promise<{ conversationId: string | null; error: string | null }> {
  // Conversations are stored with their two participant IDs always sorted
  // alphabetically (see the identical pattern, explained in more depth, in
  // src/lib/quiz.ts's sendQuizToStudent) — this guarantees we always find
  // the SAME existing conversation regardless of which of the two "started" it.
  const [a, b] = [botId, studentId].sort();
  const { data: existing } = await admin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    // No existing conversation between this bot and student — create one.
    const { data: created, error: convErr } = await admin.from('conversations').insert({ user_a: a, user_b: b }).select('id').single();
    if (convErr || !created) return { conversationId: null, error: convErr?.message || 'Could not open a conversation.' };
    conversationId = created.id;
  }

  // Post the actual message, written as if the bot company sent it
  // (sender_id = botId). Optional attachment fields default to empty
  // strings if not provided — this matches how the database column
  // defaults work, and how MessagesView.tsx checks for "is there an
  // attachment on this message?" (an empty attachment_type means no).
  const { error: msgErr } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: botId,
    body,
    attachment_url: opts.attachmentUrl || '',
    attachment_name: opts.attachmentName || '',
    attachment_type: opts.attachmentType || '',
  });
  if (msgErr) return { conversationId, error: msgErr.message };

  // Update the conversation list's preview text + "last active" timestamp,
  // exactly like a real send-message action would, so this conversation
  // sorts and displays correctly in the student's Messages tab.
  await admin.from('conversations').update({
    last_message: opts.lastMessagePreview || body,
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId);

  // If the caller wants one, also create a bell-icon notification for the
  // student — this is optional because sometimes a bot sends several
  // messages in quick succession (e.g. a decision message, immediately
  // followed by a quiz message) and we only want one notification for the
  // pair, not two.
  if (opts.notifyTitle) {
    await admin.from('notifications').insert({
      user_id: studentId,
      type: 'message',
      title: opts.notifyTitle,
      body,
      link_view: 'messages',
      link_id: conversationId,
    });
  }

  return { conversationId, error: null };
}
