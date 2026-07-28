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
    const { question, profile, matches } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ ai: false, reply: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileSummary = profile
      ? `Student: ${profile.full_name || "Unknown"}, Branch: ${profile.branch || "N/A"}, CGPA: ${profile.cgpa || "N/A"}, Skills: ${(profile.skills || []).join(", ") || "None"}`
      : "No profile data available.";

    const matchesSummary = matches && matches.length
      ? matches.slice(0, 5).map((m: any) => {
          const c = m.companies || m;
          return `${c.name} (${c.role}, ${c.package_lpa} LPA) — ${m.match_score}% match. Missing: ${(m.missing_skills || []).join(", ") || "none"}`;
        }).join("\n")
      : "No matches available.";

    const prompt = `You are a helpful AI career assistant for a college placement cell. Answer the student's question based on their profile and company matches. Keep responses concise, practical, and encouraging. Use simple formatting with line breaks.

Student Profile:
${profileSummary}

Top Company Matches:
${matchesSummary}

Student Question: ${question}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ ai: false, reply: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      return new Response(JSON.stringify({ ai: false, reply: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ai: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ai: false, reply: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
