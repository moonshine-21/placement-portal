// ============================================================================
// Vercel Serverless Function — POST /api/ai-chat
//
// WHAT THIS FILE IS: the server-side backend for the "AI Career
// Assistant" chat feature (see src/views/AIAssistantView.tsx). When a
// student types a question, the browser sends it here, this file builds a
// detailed prompt describing that student (skills, CGPA, match results)
// and forwards it to an AI provider, then sends the reply back.
//
// TWO PROVIDERS, IN ORDER:
//   1. Groq — tried first, if GROQ_API_KEY is set. Groq runs open models
//      (Llama) on its own inference chips rather than GPUs, so it tends
//      to answer noticeably faster than Gemini. Get a free key at
//      https://console.groq.com — no credit card required. Add it to
//      Vercel as GROQ_API_KEY and redeploy.
//   2. Gemini (Google) — fallback, if GROQ_API_KEY is unset or Groq is
//      rate-limited/slow/erroring, and GEMINI_API_KEY (or
//      VITE_GEMINI_API_KEY) is set.
// Neither provider is required for the app to build/run — if neither key
// is set, this endpoint just returns `{ ai: false }` and the client falls
// back to its offline quick-tips mode (see AIAssistantView.tsx).
//
// This exists so real API keys never ship to the browser. The reason
// AIAssistantView.tsx's own dev-only fallback reads `VITE_GEMINI_API_KEY`
// via `import.meta.env` is specifically because Vite bakes any VITE_-
// prefixed var straight into the CLIENT JS bundle at build time — anyone
// could copy it out of dev tools and burn through your quota. THAT risk is
// what "no VITE_ prefix" advice is about; it does NOT apply to reading
// `process.env` in this file, since this code only ever runs on Vercel's
// server, never in the browser. Prefer plain `GEMINI_API_KEY` in your
// Vercel project's Environment Variables, but this also accepts
// `VITE_GEMINI_API_KEY` below as a fallback, since it's an easy, harmless
// mix-up to make given every other env var in this project IS VITE_-
// prefixed. Either way: Vercel env vars only apply to the NEXT deployment,
// so redeploy after adding/changing one.
//
// This handler also retries transient failures (429 rate limit, 503
// overloaded) with backoff and falls back across a couple of models per
// provider, so a single busy moment doesn't immediately drop everyone to
// offline mode.
// ============================================================================

// `runtime: 'edge'` tells Vercel to run this function on its fast, globally
// distributed "Edge" infrastructure rather than a traditional server —
// lower latency for the visitor, at the cost of some Node.js APIs not
// being available (we don't need any of those here).
export const config = { runtime: 'edge' };

// Respect the admin-controlled "AI Career Assistant" feature flag even at
// the API layer — so turning it off in the admin app actually stops the
// (metered, paid) Gemini calls, not just hides the chat button in the UI.
// (Checking this only in the UI wouldn't be enough — someone could still
// call this endpoint directly and rack up AI costs even with the button
// hidden. Checking it here closes that gap.)
async function isAiAssistantEnabled(): Promise<boolean> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return true; // fail open on our own misconfiguration
  try {
    // Query Supabase's REST API directly (a lightweight way to read one
    // row without pulling in the full supabase-js library into this
    // small edge function) for the 'ai_assistant' feature flag row.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/feature_flags?key=eq.ai_assistant&select=enabled`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
    );
    if (!res.ok) return true;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return true; // no row for this flag yet — default to enabled
    return rows[0].enabled !== false;
  } catch {
    return true; // any unexpected failure — don't block the feature over it
  }
}

// The shape of the JSON the browser sends us — the student's typed
// question, plus a snapshot of their profile and match results, so the AI
// has real context to answer with (instead of us re-fetching it from the
// database ourselves, which would mean duplicating database access logic
// here — the browser already has this data loaded, so it just sends it along).
type ReqBody = {
  question?: string;
  profile?: {
    full_name?: string;
    branch?: string;
    cgpa?: number;
    skills?: string[];
    profile_completion?: number;
  };
  matches?: Array<{
    match_score?: number;
    missing_skills?: string[];
    companies?: { name?: string };
  }>;
};

// Turns the raw request data into the actual block of text ("prompt")
// sent to Gemini — this is essentially the AI's full "briefing" before it
// answers: who the student is, plus a strict list of behavior rules so
// its replies feel natural and stay honest (e.g. rule #4 stops it from
// inventing companies that don't exist in the student's real match list).
function buildPrompt(body: ReqBody): string {
  const profile = body.profile || {};
  const matches = body.matches || [];
  const skills = profile.skills || [];

  const sys = `You are a campus placement career assistant chatting with a student in an ongoing conversation. Talk like a real person having a conversation, not like you're generating a report.

Reference info about the student — you have this so you CAN answer questions about it, not so you should recite it. Only bring up specific numbers (CGPA, completion %, match scores) when the question is actually about that.
Name: ${profile.full_name || 'Student'}
Branch: ${profile.branch || 'n/a'}
CGPA: ${profile.cgpa || 'n/a'}
Skills: ${skills.join(', ') || 'none listed'}
Profile completion: ${profile.profile_completion || 0}%
Top matches: ${matches.slice(0, 5).map((m) => {
    const c = m.companies;
    return `${c?.name || 'Company'} ${m.match_score}% (missing: ${(m.missing_skills || []).join(', ') || 'none'})`;
  }).join('; ') || 'none yet'}

Rules:
1. Match your reply's length and content to what was actually asked. A greeting or small talk ("hi", "how are you", "thanks", "uh", "ok") gets a short, natural, one- or two-sentence reply — never a profile recap, never a CGPA/match-score dump.
2. Only give the fuller career-counselor breakdown (matches, skills, roadmap, completion tips) when the student asks something that calls for it.
3. Never open with a repeated template like "Hello Dev! ...". Vary your phrasing message to message like a real conversation would.
4. Do not invent companies — only mention ones listed in "Top matches" above. If there are none, say so plainly instead of naming any company.
5. No Markdown syntax: no ** for bold, no * or - for bullets, no # headers. Plain sentences and short paragraphs; a line may start with "•" if a list genuinely helps.`;

  return `${sys}\n\nStudent's message: ${body.question}`;
}

// Makes one actual network call to Google's Gemini API for a given model
// + prompt. Returns the raw `fetch` Response — the caller (the retry loop
// in `handler` below) decides what to do with it (success, retry, or give up).
//
// Each attempt is capped at `timeoutMs` via AbortController. This matters
// a lot for the overall latency budget: without it, a single slow/hanging
// call can eat most of the edge function's execution window by itself,
// leaving no time for the retry loop to try anything else before Vercel
// kills the function — which is what makes the chat feel like it "hangs
// forever" before silently dropping to offline mode on the client.
const GEMINI_CALL_TIMEOUT_MS = 6000;
// Groq is supposed to be the FAST option (see callGroq below) — if it's
// not answering within a couple seconds, waiting the full 6s Gemini gets
// defeats the entire point of trying Groq first: a struggling Groq
// attempt would eat into the time budget that should go to Gemini,
// making the assistant slower overall than just calling Gemini alone.
const GROQ_CALL_TIMEOUT_MS = 3500;

async function callGemini(apiKey: string, model: string, prompt: string) {
  // Gemini 2.5 models use thinkingBudget (a token count; 0 disables thinking).
  // Gemini 3.x models replaced this with thinkingLevel (a string) and reject
  // thinkingBudget with a 400. Gemini 3 Flash/Flash-Lite also can't fully
  // disable thinking, so "low" is the closest equivalent to "keep it fast."
  const thinkingConfig = model.startsWith('gemini-2.5')
    ? { thinkingBudget: 0 }
    : { thinkingLevel: 'low' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_CALL_TIMEOUT_MS);
  try {
    return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      // Gemini expects the API key in this specific header, rather than a
      // standard "Authorization: Bearer" header.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        // Gemini's request format wraps the prompt as one "user" turn of a
        // conversation, even for a single one-shot question like this.
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,     // how "creative"/varied the wording is (0 = very literal/repetitive, 1+ = more varied)
          maxOutputTokens: 1024, // a hard cap on reply length, so a runaway response can't balloon in size/cost
          thinkingConfig,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Groq hosts open models (Llama, etc.) on its own custom inference chips
// rather than GPUs, so replies typically come back in well under a second
// even on its free tier — useful here specifically as a fast primary
// provider, with Gemini as the fallback for whenever Groq is unset,
// rate-limited, or having a slow moment. Groq's API is OpenAI-compatible
// (POST /chat/completions with a messages array), which is a different
// shape than Gemini's, so this is a separate function rather than a shared
// one — but the retry loop that calls it below is shaped the same way.
async function callGroq(apiKey: string, model: string, prompt: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_CALL_TIMEOUT_MS);
  try {
    return await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// A tiny helper: "pause for this many milliseconds before continuing" —
// used below to wait a bit between retry attempts instead of hammering
// the AI provider's servers immediately again.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared retry loop used for BOTH providers below — tries each model in
// `models` up to `maxAttemptsPerModel` times, backing off on 429/503,
// moving to the next model on anything else. `call` and `extractText` are
// the only provider-specific parts (how to make the request, and how to
// dig the reply text back out of that provider's response shape).
async function tryProvider(
  models: string[],
  call: (model: string, prompt: string) => Promise<Response>,
  extractText: (data: unknown) => { text: string; debugInfo: string },
  prompt: string,
  label: string,
  deadline: number,
  maxAttemptsPerModel: number,
  maxBackoffMs: number
): Promise<string | null> {
  outer: for (const model of models) {
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      if (Date.now() > deadline) {
        console.error(`[ai-chat] [${label}] retry deadline exceeded, giving up early`);
        break outer;
      }
      let res: Response;
      try {
        res = await call(model, prompt);
      } catch (err) {
        const timedOut = err instanceof Error && err.name === 'AbortError';
        console.error(`[ai-chat] [${label}] ${timedOut ? 'timed out calling' : 'network error calling'} ${model} (attempt ${attempt + 1}):`, err);
        if (attempt < maxAttemptsPerModel - 1) await sleep(Math.min(300 * (attempt + 1), maxBackoffMs));
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const { text, debugInfo } = extractText(data);
        if (text.trim()) {
          console.log(`[ai-chat] [${label}] success via ${model} (attempt ${attempt + 1})`);
          return text.trim();
        }
        console.warn(`[ai-chat] [${label}] ${model} returned 200 but no text.`, debugInfo);
        break; // empty candidate — no point retrying this model
      }

      const bodyText = await res.text().catch(() => '(unreadable body)');
      console.error(`[ai-chat] [${label}] ${model} returned ${res.status} (attempt ${attempt + 1}):`, bodyText.slice(0, 500));

      if ((res.status === 429 || res.status === 503) && attempt < maxAttemptsPerModel - 1) {
        const retryAfter = res.headers.get('retry-after');
        const backoffMs = retryAfter ? Number(retryAfter) * 1000 : 400 * Math.pow(2, attempt);
        await sleep(Math.min(backoffMs, maxBackoffMs));
        continue;
      }
      break; // non-retryable error (or out of retries), try next model
    }
  }
  return null;
}

// The main entry point Vercel calls whenever someone POSTs to /api/ai-chat.
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ai: false, error: 'Method not allowed' }), { status: 405 });
  }

  // Respect the admin's on/off switch before spending any AI quota.
  if (!(await isAiAssistantEnabled())) {
    return new Response(JSON.stringify({ ai: false, error: 'AI Career Assistant is currently disabled' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Accept `VITE_GEMINI_API_KEY` too, not just `GEMINI_API_KEY`. The
  // no-VITE_-prefix advice in the file header comment is about avoiding a
  // CLIENT-side bundle leak (Vite inlines VITE_-prefixed vars into the
  // browser JS at build time) — that risk doesn't apply here, since this
  // is a server-only Edge Function reading `process.env` at request time,
  // which never ships to the browser either way. In practice this is the
  // #1 reason this feature "doesn't work despite the key being set": every
  // OTHER env var this project uses is VITE_-prefixed (VITE_SUPABASE_URL,
  // VITE_GEMINI_API_KEY for the dev-only client fallback in
  // AIAssistantView.tsx, etc.), so it's an easy, reasonable mistake to add
  // the key to Vercel under that same name and expect it to just work.
  // The other classic cause: Vercel env vars only take effect on the NEXT
  // deployment — adding one in the dashboard doesn't retroactively apply
  // to an already-running deployment, so a redeploy is required afterward.
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  // Groq (https://console.groq.com) is optional — used as a second, fast
  // fallback provider when Gemini is unset, rate-limited, or slow. Not
  // required: if this env var is absent the code below just skips it and
  // behaves exactly as before.
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey && !groqKey) {
    console.error('[ai-chat] No AI provider key found — checked GEMINI_API_KEY/VITE_GEMINI_API_KEY and GROQ_API_KEY');
    return new Response(JSON.stringify({ ai: false, error: 'No AI provider key configured on the server (checked GEMINI_API_KEY and GROQ_API_KEY) — add one in Vercel → Project Settings → Environment Variables, then redeploy' }), { status: 200 });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ai: false, error: 'Invalid request body' }), { status: 400 });
  }

  if (!body.question || !body.question.trim()) {
    return new Response(JSON.stringify({ ai: false, error: 'Missing question' }), { status: 400 });
  }

  const prompt = buildPrompt(body);

  // Each provider gets its OWN time budget, starting fresh when its turn
  // comes up — rather than one shared deadline for the whole request.
  // With a single shared deadline, a struggling Groq could burn through
  // most of the total budget before Gemini ever got a chance to try,
  // making the two-provider setup slower overall than Gemini alone was.
  // Giving Gemini its own fresh window guarantees trying Groq first can
  // only ever help (fast success) or cost a small, bounded amount of time
  // (a quick fail-over) — never crowd out Gemini's own chance to answer.

  // ---------- Provider 1: Groq ----------
  // Tried first — Groq runs open models (Llama) on its own inference
  // chips rather than GPUs, so it typically answers well under a second,
  // noticeably faster than Gemini. Only 1 attempt per model here (no
  // backoff-and-retry): Groq is meant to be the FAST path, so if it's
  // erroring or rate-limited, the right move is to fail over to Gemini
  // immediately rather than spend time retrying the "fast" option.
  if (groqKey) {
    const reply = await tryProvider(
      ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
      (model, p) => callGroq(groqKey, model, p),
      (data: any) => ({
        text: data?.choices?.[0]?.message?.content || '',
        debugInfo: `finish_reason: ${data?.choices?.[0]?.finish_reason}`,
      }),
      prompt,
      'groq',
      Date.now() + 8000, // worst case ~8s spent here before moving on
      1,    // maxAttemptsPerModel — fail fast, don't retry the "fast" provider
      800   // maxBackoffMs (barely used, since attempt is always the last one)
    );
    if (reply) {
      return new Response(JSON.stringify({ ai: true, reply, provider: 'groq' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ---------- Provider 2: Gemini (fallback) ----------
  if (geminiKey) {
    const reply = await tryProvider(
      ['gemini-flash-latest', 'gemini-flash-lite-latest'],
      (model, p) => callGemini(geminiKey, model, p),
      (data: any) => ({
        text: data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '',
        debugInfo: `finishReason: ${data?.candidates?.[0]?.finishReason}, promptFeedback: ${JSON.stringify(data?.promptFeedback)}`,
      }),
      prompt,
      'gemini',
      Date.now() + 14000, // its own fresh budget, independent of what Groq used above
      2,     // maxAttemptsPerModel — worth one retry on Gemini, which rate-limits more often
      1200   // maxBackoffMs
    );
    if (reply) {
      return new Response(JSON.stringify({ ai: true, reply, provider: 'gemini' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Every provider/model/attempt failed — return a clear "ai: false"
  // response rather than an error status, so the chat UI can show a
  // friendly "AI assistant unavailable right now" message instead of a crash.
  console.error('[ai-chat] exhausted all providers/models/attempts, returning ai:false');
  return new Response(JSON.stringify({ ai: false, error: 'All providers exhausted or rate limited' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
