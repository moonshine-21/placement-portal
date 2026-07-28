const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { file_base64, mime_type, file_name } = req.body || {};

  if (!file_base64) {
    res.status(400).json({ error: "File data is required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ai: false, analysis: null });
    return;
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

  try {
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
      res.status(200).json({ ai: false, analysis: null });
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      res.status(200).json({ ai: false, analysis: null });
      return;
    }

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      try {
        analysis = JSON.parse(cleaned);
      } catch {
        res.status(200).json({ ai: false, analysis: null });
        return;
      }
    }

    res.status(200).json({ ai: true, analysis });
  } catch (err) {
    res.status(200).json({ ai: false, analysis: null });
  }
}
