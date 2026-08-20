// Server-only Gemini via /api/ai-chat — never call Gemini from the browser.

export type AIContext = {
  name?: string;
  branch?: string;
  cgpa?: number | string | null;
  skills?: string[];
  bio?: string | null;
  profileCompletion?: number;
  applicationsCount?: number;
  matches?: { company: string; score: number; role?: string }[];
  events?: { title: string; date?: string }[];
};

export type AIAction =
  | { type: 'OPEN_VIEW'; view: string }
  | { type: 'OPEN_COMPANY'; id: string }
  | { type: 'NONE' };

export type AIResponse = {
  ok: boolean;
  reply: string;
  action?: AIAction;
  error?: string;
};

export async function askPlacementAI(
  question: string,
  ctx: AIContext,
  history: { role: 'user' | 'assistant'; text: string }[] = []
): Promise<AIResponse> {
  try {
    const res = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        history: history.slice(-8),
        // fields expected by existing api/ai-chat.ts (best-effort)
        name: ctx.name,
        branch: ctx.branch,
        cgpa: ctx.cgpa,
        skills: ctx.skills,
        bio: ctx.bio,
        matches: ctx.matches,
        applicationsCount: ctx.applicationsCount,
        profileCompletion: ctx.profileCompletion,
        events: ctx.events,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ai && data?.reply) {
      return { ok: true, reply: String(data.reply), action: data.action };
    }
    return {
      ok: false,
      reply: data?.error
        ? `I'm having trouble reaching my intelligence service right now. ${data.error}`
        : "I'm having trouble reaching my intelligence service right now. Your placement data is still available.",
      error: data?.error || 'unavailable',
    };
  } catch {
    return {
      ok: false,
      reply: "I'm offline from the intelligence service. The rest of the platform still works.",
      error: 'network',
    };
  }
}
