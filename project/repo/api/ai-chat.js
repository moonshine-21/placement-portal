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

  const { question, profile, matches } = req.body || {};

  if (!question) {
    res.status(400).json({ error: "Question is required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ai: false, reply: null });
    return;
  }

  const profileSummary = profile
    ? `Student: ${profile.full_name || "Unknown"}, Branch: ${profile.branch || "N/A"}, CGPA: ${profile.cgpa || "N/A"}, Skills: ${(profile.skills || []).join(", ") || "None"}`
    : "No profile data available.";

  const matchesSummary = matches && matches.length
    ? matches.slice(0, 5).map((m) => {
        const c = m.companies || m;
        return `${c.name} (${c.role}, ₹${c.package_lpa} LPA) — ${m.match_score}% match. Missing: ${(m.missing_skills || []).join(", ") || "none"}`;
      }).join("\n")
    : "No matches available.";

  const prompt = `You are a helpful AI career assistant for a college placement cell. Answer the student's question based on their profile and company matches. Keep responses concise, practical, and encouraging. Use simple formatting with line breaks.

Student Profile:
${profileSummary}

Top Company Matches:
${matchesSummary}

Student Question: ${question}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      res.status(200).json({ ai: false, reply: null });
      return;
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      res.status(200).json({ ai: false, reply: null });
      return;
    }

    res.status(200).json({ ai: true, reply });
  } catch (err) {
    res.status(200).json({ ai: false, reply: null });
  }
}
