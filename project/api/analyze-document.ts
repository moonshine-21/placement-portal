// ============================================================================
// Vercel Serverless Function — POST /api/analyze-document
//
// WHAT THIS FILE IS: the real backend for the "Upload Documents" page (see
// src/views/UploadView.tsx). It replaces the old client-side-only
// keyword-dictionary "extraction" (which had no idea what a document
// actually WAS — it would happily scan a photo's raw bytes for substrings
// that looked like skill names and call that "analysis"). This endpoint
// instead sends the actual file — image, PDF, or plain text — to Gemini's
// multimodal model and asks it to genuinely look at the content:
//
//   1. Is this even a document that belongs on a placement portal (a
//      resume, marksheet/transcript, certificate, project report, cover
//      letter, offer letter, etc)? If not — a game screenshot, a random
//      photo, a meme, a blank page — say so plainly instead of pretending
//      to find skills in it.
//   2. If it IS a real document: what TYPE is it, what does it actually
//      contain (skills, CGPA, education, experience, projects — whichever
//      apply), and — for resumes/reports especially — a quality score
//      with concrete, specific ways to improve it.
//
// The client sends the file as base64 (images/PDFs go to Gemini as
// inline file data so it can actually SEE them; .txt/.md just go as
// plain text). generateJSON (api/_lib/gemini.ts) handles the model
// call + retry/fallback and JSON parsing.
// ============================================================================

import { generateJSON, type GeminiPart } from './_lib/gemini.js';
import { rateLimit, sweepIfDue, clientIp } from './_lib/rateLimit.js';

export const config = { runtime: 'edge' };

// What we ask Gemini to hand back, and what the client renders.
export type DocumentAnalysis = {
  valid: boolean;                 // false = "this isn't a placement-relevant document at all"
  detectedContent: string;        // plain description of what the file actually shows/contains — used both to explain a rejection AND as a one-line summary for an accepted doc
  documentType: string;           // e.g. 'resume', 'marksheet', 'certificate', 'project_report', 'cover_letter', 'other', or 'unknown' when invalid
  summary: string;                // 2-3 sentence overview, empty when invalid
  skills: string[];               // only meaningfully populated for resumes/certificates
  cgpa: string | null;            // only meaningfully populated for marksheets/transcripts (or a resume that states one)
  score: number | null;           // 0-100 quality/completeness rating, null when invalid or not a scoreable document
  strengths: string[];            // what's already good about it
  improvements: string[];         // specific, actionable ways to make it better
};

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB — generous for a resume/marksheet, cheap enough to stay well under Gemini's request size limits

type ReqBody = {
  filename?: string;
  mimeType?: string;
  fileBase64?: string; // raw base64 payload, no "data:...;base64," prefix
  extractedText?: string; // for plain-text formats the client already decoded (.txt/.md), sent instead of fileBase64
};

// Gemini can look directly at these formats. Anything else (.doc, .docx —
// legacy Word formats have no simple, safe browser-side text extraction and
// aren't a Gemini-supported inline MIME type) falls back to whatever crude
// text the client could scrape out client-side via extractedText, with a
// note in the prompt that the extraction may be incomplete/garbled.
const VISION_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);

function buildPrompt(filename: string, isRawTextFallback: boolean): string {
  return `You are a document-analysis assistant for a campus placement portal. A student just uploaded a file named "${filename}". ${
    isRawTextFallback
      ? "The file's own format couldn't be read directly, so what follows is a crude, possibly garbled best-effort text scrape of it — treat garbling/missing formatting as a limitation of the scrape, not evidence the document is invalid, but if the scrape is genuinely too broken to judge, say so honestly instead of guessing."
      : "You can see the actual file content below/attached."
  }

First, decide: is this genuinely a document relevant to a job/internship placement process — a resume/CV, an academic marksheet or transcript, a certificate, a project report, a cover letter, an offer/internship letter, or similar? If it's clearly something else entirely (a game screenshot, a random photo, a meme, an unrelated app UI, a blank/corrupted file, etc.), mark it invalid and plainly describe what it actually is, so the student understands their mistake and knows to re-upload the right kind of file.

If it IS a relevant document, analyze it thoroughly and honestly:
- Identify its specific type.
- Extract any technical/professional skills actually stated or clearly demonstrated (never invent ones that aren't genuinely there).
- Extract a CGPA/GPA if one is present.
- Give an honest 0-100 quality score for how strong this document is for placement purposes (a resume: clarity, structure, quantified impact, relevant skills, no typos; a marksheet: completeness/legibility; etc). Be a real, discerning reviewer — a mediocre document should not score in the 80s+.
- List concrete strengths.
- List concrete, specific, actionable improvements (not generic platitudes like "make it better" — say exactly what to add, cut, reword, or fix).

Respond with ONLY this JSON shape, nothing else:
{
  "valid": boolean,
  "detectedContent": "one plain sentence describing what this file actually is/shows",
  "documentType": "resume" | "marksheet" | "certificate" | "project_report" | "cover_letter" | "offer_letter" | "other" | "unknown",
  "summary": "2-3 sentence overview (empty string if invalid)",
  "skills": ["skill1", "skill2"],
  "cgpa": "8.5" or null,
  "score": 0-100 or null,
  "strengths": ["...", "..."],
  "improvements": ["...", "..."]
}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405 });
  }

  sweepIfDue();
  // Vision calls are pricier than a plain text chat turn — a tighter
  // window than ai-chat's keeps this from becoming an easy way to burn
  // through Gemini quota by spamming file uploads.
  const rl = rateLimit(`analyze-document:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ ok: false, error: 'Too many uploads, please wait a moment and try again.' }), {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
    });
  }

  let body: ReqBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body' }), { status: 400 });
  }

  const filename = body.filename || 'uploaded file';

  if (body.fileBase64 && body.fileBase64.length > MAX_FILE_BYTES * 1.4) {
    // base64 inflates size by ~33% — 1.4x gives headroom without being exact
    return new Response(JSON.stringify({ ok: false, error: 'File is too large to analyze (max 8MB).' }), { status: 400 });
  }

  const mimeType = body.mimeType || '';
  const canUseVision = !!body.fileBase64 && VISION_MIME_TYPES.has(mimeType);

  if (!canUseVision && !body.extractedText?.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "Couldn't read this file — please upload a PDF, image, or text file." }), { status: 400 });
  }

  const parts: GeminiPart[] = canUseVision
    ? [{ inlineData: { mimeType, data: body.fileBase64! } }, { text: buildPrompt(filename, false) }]
    : [{ text: buildPrompt(filename, true) }, { text: `\n\nExtracted text:\n${body.extractedText!.slice(0, 20000)}` }];

  const analysis = await generateJSON<DocumentAnalysis>(parts, { temperature: 0.4, maxOutputTokens: 1536 });

  if (!analysis) {
    return new Response(JSON.stringify({ ok: false, error: 'The AI analyzer is temporarily unavailable — please try again in a moment.' }), { status: 200 });
  }

  // Defend against a malformed/partial model response rather than trusting it blindly.
  const safe: DocumentAnalysis = {
    valid: !!analysis.valid,
    detectedContent: typeof analysis.detectedContent === 'string' ? analysis.detectedContent : '',
    documentType: typeof analysis.documentType === 'string' ? analysis.documentType : 'unknown',
    summary: typeof analysis.summary === 'string' ? analysis.summary : '',
    skills: Array.isArray(analysis.skills) ? analysis.skills.filter((s) => typeof s === 'string') : [],
    cgpa: typeof analysis.cgpa === 'string' ? analysis.cgpa : null,
    score: typeof analysis.score === 'number' ? Math.max(0, Math.min(100, Math.round(analysis.score))) : null,
    strengths: Array.isArray(analysis.strengths) ? analysis.strengths.filter((s) => typeof s === 'string') : [],
    improvements: Array.isArray(analysis.improvements) ? analysis.improvements.filter((s) => typeof s === 'string') : [],
  };

  return new Response(JSON.stringify({ ok: true, analysis: safe }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
