// ============================================================================
// Vercel Serverless Function — POST /api/document-chat
//
// WHAT THIS FILE IS: the backend for the chat box on the Upload Documents
// page (src/views/UploadView.tsx) — the same idea as api/ai-chat.ts (which
// powers the separate AI Career Assistant tab), but scoped to whatever
// document(s) the student just uploaded, so they can ask follow-up
// questions like "how do I fix the second improvement point?" or "is my
// CGPA competitive?" and get an answer grounded in the actual analysis,
// not a generic profile recap.
//
// Deliberately a thin sibling of ai-chat.ts rather than a shared import,
// so a change to one chat surface can't silently break the other.
// ============================================================================

import { generateText } from './_lib/gemini.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

type DocSummary = {
  filename?: string;
  documentType?: string;
  score?: number | null;
  skills?: string[];
  cgpa?: string | null;
  strengths?: string[];
  improvements?: string[];
  summary?: string;
};

type ReqBody = {
  question?: string;
  documents?: DocSummary[]; // every doc analyzed so far this session, most recent last
  history?: Array<{ role: 'user' | 'bot'; text: string }>; // recent turns, for follow-up context
};

function buildPrompt(body: ReqBody): string {
  const docs = body.documents || [];
  const docBlock = docs.length
    ? docs.map((d, i) => `Document ${i + 1}: "${d.filename || 'file'}" (${d.documentType || 'unknown type'})
  Score: ${d.score ?? 'n/a'}/100
  Skills found: ${(d.skills || []).join(', ') || 'none'}
  CGPA: ${d.cgpa || 'n/a'}
  Strengths: ${(d.strengths || []).join('; ') || 'none noted'}
  Improvements suggested: ${(d.improvements || []).join('; ') || 'none noted'}
  Summary: ${d.summary || 'n/a'}`).join('\n\n')
    : 'No documents have been analyzed yet in this session.';

  const historyBlock = (body.history || []).slice(-8)
    .map((h) => `${h.role === 'user' ? 'Student' : 'You'}: ${h.text.replace(/<[^>]+>/g, ' ').slice(0, 500)}`)
    .join('\n');

  return `You are a career-document assistant on a campus placement portal, helping a student improve documents they just uploaded (resume, marksheet, certificates, etc). Talk like a real, encouraging-but-honest mentor in an ongoing conversation — not like you're regenerating a report from scratch every message.

What's been analyzed so far this session:
${docBlock}

${historyBlock ? `Recent conversation:\n${historyBlock}\n` : ''}
Rules:
1. Ground every answer in the actual analysis above — never invent skills, scores, or content that weren't found in their real document(s).
2. If they ask something the analysis doesn't cover, say so honestly rather than guessing.
3. Keep answers focused and specific — concrete rewording suggestions, specific skills to add, specific formatting fixes — not generic advice.
4. Match reply length to the question: a quick question gets a short answer.
5. No Markdown syntax: no ** for bold, no # headers. Plain sentences; a line may start with "•" if a list genuinely helps.

Student's message: ${body.question}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ai: false, error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  const rl = rateLimit(`document-chat:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ai: false, error: 'Too many requests, try again shortly.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
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

  const reply = await generateText(buildPrompt(body), { temperature: 0.7, maxOutputTokens: 800 });

  if (!reply) {
    return new Response(JSON.stringify({ ai: false, error: 'AI service unavailable' }), { status: 200 });
  }

  return new Response(JSON.stringify({ ai: true, reply }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
