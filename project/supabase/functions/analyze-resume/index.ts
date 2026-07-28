import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { file_base64, mime_type, file_name } = await req.json();
    if (!file_base64) {
      return new Response(JSON.stringify({ error: "File data is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ ai: false, analysis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are an expert resume analyzer for a college placement cell. Analyze this resume/document and extract structured information. Return ONLY valid JSON (no markdown, no code fences) with this exact shape:

{
  "document_type": "resume" | "cover letter" | "academic transcript" | "other",
  "summary": "2-3 sentence summary of the candidate",
  "score": <number 0-100>,
  "eligibility": <boolean>,
  "skills": ["skill1", "skill2", ...],
  "missing_skills": ["skill1", ...],
  "education": ["degree, institution, year", ...],
  "experience": ["role at company, duration, key achievement", ...],
  "achievements": ["achievement1", ...],
  "tips": ["improvement tip 1", ...],
  "cgpa": <number or null>,
  "branch": "CSE" | "IT" | "ECE" | "EEE" | "AI" | null
}

Guidelines:
- score: overall resume quality (0-100), based on skills, experience, and presentation
- eligibility: true if the candidate has 3+ relevant skills and a CGPA >= 6.5
- skills: technical and soft skills detected
- missing_skills: common industry skills the candidate should learn
- cgpa: extract if mentioned, null if not found
- branch: map to standard abbreviations (CSE, IT, ECE, EEE, AI), null if not found`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mime_type || "application/pdf",
                data: file_base64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ ai: false, analysis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(JSON.stringify({ ai: false, analysis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try {
        analysis = JSON.parse(cleaned);
      } catch {
        return new Response(JSON.stringify({ ai: false, analysis: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ai: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ai: false, analysis: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
