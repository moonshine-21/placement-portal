// Vercel Serverless Function — POST /api/ai-chat
//
// This exists so the Gemini API key never ships to the browser. Reading it
// from `VITE_GEMINI_API_KEY` (or any VITE_-prefixed var) bakes it straight
// into the client JS bundle, where anyone can copy it out of dev tools and
// use it themselves — which silently burns through your quota and is the
// most common reason a client-side Gemini integration "stops working under
// load." Set GEMINI_API_KEY (no VITE_ prefix) in your Vercel project's
// Environment Variables instead; that name is only readable on the server.
//
// This handler also retries transient failures (429 rate limit, 503
// overloaded) with backoff and falls back across a couple of models, so a
// single busy moment doesn't immediately drop everyone to offline mode.

export const config = { runtime: 'edge' };

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

function buildPrompt(body: ReqBody): string {
  const profile = body.profile || {};
  const matches = body.matches || [];
  const skills = profile.skills || [];

  const sys = `You are a helpful campus placement career assistant for a student.
Student: ${profile.full_name || 'Student'}, branch ${profile.branch || 'n/a'}, CGPA ${profile.cgpa || 'n/a'}.
Skills: ${skills.join(', ') || 'none listed'}.
Profile completion: ${profile.profile_completion || 0}%.
Top matches: ${matches.slice(0, 5).map((m) => {
    const c = m.companies;
    return `${c?.name || 'Company'} ${m.match_score}% (missing: ${(m.missing_skills || []).join(', ') || 'none'})`;
  }).join('; ') || 'none yet'}.
Answer briefly and professionally, in a warm but confident tone — like a knowledgeable career counselor, not a generic chatbot. Do not use Markdown syntax (no ** for bold, no * or - for bullet points, no # headers). Write in plain sentences and short paragraphs; you may start a line with a bullet character "•" if a list genuinely helps. Do not invent companies the student is not matched with.`;

  return `${sys}\n\nStudent question: ${body.question}`;
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ai: false, error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[ai-chat] GEMINI_API_KEY is not set in this environment');
    return new Response(JSON.stringify({ ai: false, error: 'GEMINI_API_KEY not configured on the server' }), { status: 200 });
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
  const models = ['gemini-flash-latest', 'gemini-2.5-flash'];
  const maxAttemptsPerModel = 3;

  for (const model of models) {
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      let res: Response;
      try {
        res = await callGemini(apiKey, model, prompt);
      } catch (err) {
        console.error(`[ai-chat] network error calling ${model} (attempt ${attempt + 1}):`, err);
        // network hiccup — brief backoff, then retry
        await sleep(300 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
        if (text.trim()) {
          console.log(`[ai-chat] success via ${model} (attempt ${attempt + 1})`);
          return new Response(JSON.stringify({ ai: true, reply: text.trim() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        console.warn(`[ai-chat] ${model} returned 200 but no text. finishReason:`, data?.candidates?.[0]?.finishReason, 'promptFeedback:', data?.promptFeedback);
        // empty candidate — no point retrying this model
        break;
      }

      const bodyText = await res.text().catch(() => '(unreadable body)');
      console.error(`[ai-chat] ${model} returned ${res.status} (attempt ${attempt + 1}):`, bodyText.slice(0, 500));

      // 429 (rate limited) and 503 (overloaded) are transient — back off and retry.
      // Anything else (404 model retired, 400 bad request, 403 bad key) — move on immediately.
      if (res.status === 429 || res.status === 503) {
        const retryAfter = res.headers.get('retry-after');
        const backoffMs = retryAfter ? Number(retryAfter) * 1000 : 400 * Math.pow(2, attempt);
        await sleep(Math.min(backoffMs, 4000));
        continue;
      }
      break; // non-retryable error, try next model
    }
  }

  console.error('[ai-chat] exhausted all models/attempts, returning ai:false');
  return new Response(JSON.stringify({ ai: false, error: 'All models exhausted or rate limited' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
