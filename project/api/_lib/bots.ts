import type { SupabaseClient } from '@supabase/supabase-js';

export type BotPersona = {
  id: string;
  org_name: string;
  industry: string;
  about_us: string;
  skills_required: string[];
};

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
export async function sendBotMessage(
  admin: SupabaseClient,
  botId: string,
  studentId: string,
  body: string,
  opts: { attachmentUrl?: string; attachmentName?: string; attachmentType?: string; lastMessagePreview?: string; notifyTitle?: string } = {}
): Promise<{ conversationId: string | null; error: string | null }> {
  const [a, b] = [botId, studentId].sort();
  const { data: existing } = await admin.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error: convErr } = await admin.from('conversations').insert({ user_a: a, user_b: b }).select('id').single();
    if (convErr || !created) return { conversationId: null, error: convErr?.message || 'Could not open a conversation.' };
    conversationId = created.id;
  }

  const { error: msgErr } = await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: botId,
    body,
    attachment_url: opts.attachmentUrl || '',
    attachment_name: opts.attachmentName || '',
    attachment_type: opts.attachmentType || '',
  });
  if (msgErr) return { conversationId, error: msgErr.message };

  await admin.from('conversations').update({
    last_message: opts.lastMessagePreview || body,
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId);

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
