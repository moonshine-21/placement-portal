// Shared "call Gemini and get text back" helper for every bot-* endpoint.
// Same retry/model-fallback shape as api/ai-chat.ts (kept here instead of
// duplicated four times), because a single busy moment on Google's side
// shouldn't make a bot company go silent.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function thinkingConfigFor(model: string) {
  // Gemini 2.5 models use thinkingBudget (a token count; 0 disables
  // thinking). Gemini 3.x replaced this with thinkingLevel (a string) and
  // rejects thinkingBudget with a 400.
  return model.startsWith('gemini-2.5') ? { thinkingBudget: 0 } : { thinkingLevel: 'low' };
}

// A single piece of a multimodal request — either plain text, or an
// inline file (image/PDF) given as base64 data with its MIME type. Used
// by document analysis, where the "prompt" isn't just text — it's the
// actual uploaded file bytes plus instructions about what to do with them.
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function toApiPart(part: GeminiPart) {
  return 'text' in part ? { text: part.text } : { inline_data: { mime_type: part.inlineData.mimeType, data: part.inlineData.data } };
}

async function callOnce(apiKey: string, model: string, parts: GeminiPart[], temperature: number, maxOutputTokens: number) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: parts.map(toApiPart) }],
      generationConfig: { temperature, maxOutputTokens, thinkingConfig: thinkingConfigFor(model) },
    }),
  });
}

// Returns the generated text, or null if every model/attempt was exhausted
// (rate-limited, overloaded, or misconfigured). Callers should treat null
// as "skip this bot action for now" rather than fabricate a fallback reply.
export async function generateText(
  prompt: string | GeminiPart[],
  { temperature = 0.8, maxOutputTokens = 1024 }: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[gemini] GEMINI_API_KEY not configured');
    return null;
  }

  const parts: GeminiPart[] = typeof prompt === 'string' ? [{ text: prompt }] : prompt;
  const models = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  const maxAttemptsPerModel = 3;

  for (const model of models) {
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      let res: Response;
      try {
        res = await callOnce(apiKey, model, parts, temperature, maxOutputTokens);
      } catch (err) {
        console.error(`[gemini] network error calling ${model} (attempt ${attempt + 1}):`, err);
        await sleep(300 * (attempt + 1));
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
        if (text.trim()) return text.trim();
        console.warn(`[gemini] ${model} returned 200 but no text. finishReason:`, data?.candidates?.[0]?.finishReason);
        break;
      }

      const bodyText = await res.text().catch(() => '(unreadable body)');
      console.error(`[gemini] ${model} returned ${res.status} (attempt ${attempt + 1}):`, bodyText.slice(0, 500));

      if (res.status === 429 || res.status === 503) {
        const retryAfter = res.headers.get('retry-after');
        const backoffMs = retryAfter ? Number(retryAfter) * 1000 : 400 * Math.pow(2, attempt);
        await sleep(Math.min(backoffMs, 4000));
        continue;
      }
      break; // non-retryable — try the next model
    }
  }

  console.error('[gemini] exhausted all models/attempts');
  return null;
}

// Same as generateText, but strips ```json fences and parses the result.
// Returns null on any failure (no text, or invalid JSON) — callers should
// treat that as "skip this bot action," never guess at a shape.
export async function generateJSON<T>(prompt: string | GeminiPart[], opts?: { temperature?: number; maxOutputTokens?: number }): Promise<T | null> {
  const suffix = '\n\nRespond with ONLY raw JSON — no markdown code fences, no preamble, no explanation.';
  const withSuffix: string | GeminiPart[] = typeof prompt === 'string'
    ? `${prompt}${suffix}`
    : [...prompt, { text: suffix }];
  const text = await generateText(withSuffix, opts);
  if (!text) return null;
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('[gemini] JSON parse failed:', err, 'raw text:', cleaned.slice(0, 500));
    return null;
  }
}
