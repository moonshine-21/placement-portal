// Vercel serverless function: real Gemini-powered resume / document analysis.
// Lives at /api/analyze-resume. Runs server-side so GEMINI_API_KEY is never
// exposed to the browser. Accepts a base64-encoded file (PDF or image) and
// returns a structured analysis the frontend renders directly.
//
// Set GEMINI_API_KEY in your Vercel project's Environment Variables
// (Project → Settings → Environment Variables).

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM = `You are an expert career coach and resume reviewer for a college placement portal. \
You are given a student's resume or academic document (marksheet, transcript, certificate) as a file. \
Analyze it and return ONLY a JSON object (no markdown, no code fences) with EXACTLY these keys:
{
  "document_type": "resume" | "marksheet" | "transcript" | "certificate" | "other",
  "summary": "2-3 sentence plain-text summary of what the document contains",
  "skills": ["array of technical / soft skills detected"],
  "cgpa": number_or_null,
  "branch": "detected branch or empty string",
  "education": ["array of degree/qualification entries as short strings"],
  "experience": ["array of project, internship, or work entries as short strings"],
  "achievements": ["array of notable achievements as short strings"],
  "score": integer_0_to_100_overall_quality_score,
  "eligibility": boolean_whether_student_is_eligible_for_most_placements,
  "missing_skills": ["skills the student should learn to improve placement chances"],
  "tips": ["3-5 concrete, actionable improvement tips as short strings"]
}
Be accurate and conservative — only report skills/CGPA/branch you can clearly see in the document. \
If the file is an image, treat it as a scanned document and extract whatever text is visible.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ ai: false, reason: "no_api_key" });
  }

  const { file_base64, mime_type, file_name } = req.body || {};
  if (!file_base64 || !mime_type) {
    return res.status(400).json({ error: "Missing file_base64 or mime_type" });
  }

  try {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              inline_data: {
                mime_type,
                data: file_base64,
              },
            },
            {
              text: `Analyze this document${file_name ? ` (filename: ${file_name})` : ""}. Return the JSON object as instructed.`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 1200,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    };

    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Gemini analyze error:", upstream.status, errText);
      return res.status(200).json({ ai: false, reason: "upstream_error", detail: errText });
    }

    const data = await upstream.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) return res.status(200).json({ ai: false, reason: "empty_response" });

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // If Gemini returned non-JSON despite the prompt, surface it raw.
      return res.status(200).json({ ai: false, reason: "parse_error", raw: text });
    }

    return res.status(200).json({ ai: true, analysis: parsed });
  } catch (err) {
    console.error("analyze-resume function failed:", err);
    return res.status(200).json({ ai: false, reason: "exception" });
  }
}
