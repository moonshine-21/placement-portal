/* =========================================================
   Smart Placement Cell Portal — app.js
   Auth · Theme · Sidebar · Charts · AI Assistant · Supabase
   ========================================================= */

// Supabase credentials injected by js/env.js (Vite module)
let SUPABASE_URL = null;
let SUPABASE_ANON_KEY = null;

let supabase = null;
let currentUser = null;
let currentProfile = null;
let charts = {};
let allCompanies = [];
let allMatches = [];

/* =========================================================
   PHASE 2 — THEME SYSTEM
   ========================================================= */
const THEME_KEY = "spc-theme";

function applyTheme(theme) {
  document.body.classList.remove("light", "dark", "aurora");
  document.body.classList.add(theme);
  localStorage.setItem(THEME_KEY, theme);
  if (typeof Chart !== "undefined") styleCharts(theme);
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
}

function initThemeSwitcher() {
  const btn = document.getElementById("themeBtn");
  const menu = document.getElementById("themeMenu");
  if (!btn || !menu) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("click", () => (menu.hidden = true));
  menu.addEventListener("click", (e) => e.stopPropagation());
  menu.querySelectorAll("button[data-theme]").forEach((b) =>
    b.addEventListener("click", () => {
      applyTheme(b.dataset.theme);
      menu.hidden = true;
    })
  );
  document.querySelectorAll(".theme-pick").forEach((b) =>
    b.addEventListener("click", () => applyTheme(b.dataset.theme))
  );
}

/* =========================================================
   PHASE 4 — SUPABASE + AUTH
   ========================================================= */
function initSupabase() {
  if (typeof window.supabase === "undefined") return;
  SUPABASE_URL = window.__SUPABASE_URL__;
  SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Supabase env vars missing.");
    return;
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ---------- Login page ---------- */
function initAuthPage() {
  initTheme();
  initSupabase();
  if (!supabase) {
    showError("Cannot connect to authentication service. Please refresh.");
    return;
  }

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) window.location.href = "dashboard.html";
  });

  const form = document.getElementById("authForm");
  const errEl = document.getElementById("loginError");
  const submitBtn = document.getElementById("submitBtn");
  const toggle = document.getElementById("toggleMode");
  const fullNameField = document.getElementById("fullNameField");
  const fullNameInput = document.getElementById("fullName");
  let mode = "signin";
  const titleEl = document.querySelector(".login-card h1");
  const switchText = document.querySelector(".login-switch a");

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    mode = mode === "signin" ? "signup" : "signin";
    titleEl.textContent = mode === "signin" ? "Smart Placement Cell" : "Create Account";
    submitBtn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
    switchText.textContent = mode === "signin" ? "Create an account" : "Sign in instead";
    fullNameField.style.display = mode === "signup" ? "block" : "none";
    fullNameInput.required = mode === "signup";
    errEl.classList.remove("show");
  });

  initPasswordToggle();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.classList.remove("show");
    submitBtn.disabled = true;
    submitBtn.textContent = "Please wait…";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const fullName = fullNameInput.value.trim();

    let data, error;
    if (mode === "signin") {
      ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    } else {
      ({ data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      }));
      // Supabase returns a user object with no error and an empty `identities`
      // array when someone signs up with an email that's already registered
      // (an anti-enumeration measure) — surface that clearly instead of
      // silently pretending signup worked.
      if (!error && data.user && data.user.identities && data.user.identities.length === 0) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign Up";
        showError("An account with this email already exists. Please sign in instead.");
        return;
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
    if (error) {
      showError(/already registered|already exists/i.test(error.message)
        ? "An account with this email already exists. Please sign in instead."
        : error.message);
      return;
    }
    if (data.session) {
      window.location.href = "dashboard.html";
    } else if (data.user && mode === "signup") {
      showError("Account created — check your email to confirm, then sign in.");
    }
  });

  document.getElementById("googleBtn").addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/frontend/dashboard.html" },
    });
    if (error) showError(error.message);
  });
}

/** Eye / eye-off toggle for the password field. */
function initPasswordToggle() {
  const btn = document.getElementById("passwordToggle");
  const input = document.getElementById("password");
  const icon = document.getElementById("eyeIcon");
  if (!btn || !input) return;
  const EYE = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  const EYE_OFF = '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.6 18.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
  btn.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    icon.innerHTML = showing ? EYE : EYE_OFF;
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });
}

function showError(msg) {
  const el = document.getElementById("loginError");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
}

/* ---------- Dashboard auth guard ---------- */
async function requireAuth() {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "login.html";
    return false;
  }
  currentUser = data.session.user;
  return true;
}

async function loadProfile() {
  if (!supabase || !currentUser) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.error("loadProfile fetch failed:", error);
    return null;
  }
  if (!data) {
    const insert = {
      id: currentUser.id,
      email: currentUser.email,
      full_name: currentUser.user_metadata?.full_name || "",
    };
    const { data: created, error: insErr } = await supabase.from("profiles").insert(insert).select().maybeSingle();
    if (insErr) {
      console.error("loadProfile insert failed:", insErr);
      return null;
    }
    currentProfile = created;
  } else {
    currentProfile = data;
  }
  return currentProfile;
}

async function saveProfile(updates) {
  if (!supabase || !currentUser) return { error: new Error("Not signed in") };
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: currentUser.id, email: currentUser.email, ...updates }, { onConflict: "id" });
  if (error) console.error("saveProfile failed:", error);
  return { error };
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.href = "login.html";
}

/* =========================================================
   SIDEBAR NAVIGATION
   ========================================================= */
const VIEW_META = {
  dashboard: { t: "Dashboard", s: "AI-driven placement insights at a glance" },
  profile: { t: "Profile", s: "Manage your academic and skills profile" },
  upload: { t: "Upload Documents", s: "Upload your resume for AI analysis" },
  matches: { t: "Match & Recommendations", s: "Companies matched to your profile" },
  roadmap: { t: "Skill Gap Roadmap", s: "Close the gaps blocking your top matches" },
  analysis: { t: "Resume Analysis", s: "Deep breakdown of your resume" },
  applications: { t: "Applications", s: "Track companies you've applied to" },
  simulator: { t: "What-If Simulator", s: "Preview how profile changes affect matches" },
  analytics: { t: "Analytics", s: "Cohort-wide placement analytics" },
  settings: { t: "Settings", s: "Manage appearance and account" },
  "company-dashboard": { t: "Overview", s: "How your hiring is going" },
  "company-profile": { t: "Company Profile", s: "Manage your public company profile" },
  companies: { t: "Companies", s: "Browse companies and apply" },
  "company-public": { t: "Company Profile", s: "Company details" },
  applicants: { t: "Applicants", s: "Everyone who has applied to you" },
  messages: { t: "Messages", s: "Direct messages with companies and candidates" },
};

function initSidebar() {
  const items = document.querySelectorAll(".side-item[data-view]");
  items.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      if (item.dataset.view === "ai-assistant") return; // handled by initAIAssistant()
      switchView(item.dataset.view);
    });
  });
  const toggle = document.getElementById("menuToggle");
  const sb = document.getElementById("sidebar");
  if (toggle && sb) toggle.addEventListener("click", () => sb.classList.toggle("open"));
}

function switchView(view) {
  document.querySelectorAll(".side-item[data-view]").forEach((i) =>
    i.classList.toggle("active", i.dataset.view === view)
  );
  document.querySelectorAll(".view").forEach((v) =>
    v.classList.toggle("active", v.id === "view-" + view)
  );
  const meta = VIEW_META[view];
  if (meta) {
    document.getElementById("viewTitle").textContent = meta.t;
    document.getElementById("viewSub").textContent = meta.s;
  }
  if (window.innerWidth <= 760) document.getElementById("sidebar").classList.remove("open");
  if (view === "analytics") loadAnalytics();
  if (view === "applications") loadApplications();
  if (view === "company-dashboard") loadCompanyOverview();
  if (view === "company-profile") loadCompanyProfileForm();
  if (view === "companies") loadCompanyBrowse();
  if (view === "applicants") loadApplicants();
  if (view === "messages") loadConversations();
  if (view === "jobs") loadJobs();
}

/* =========================================================
   ROLE-BASED UI — student vs company gets a different dashboard
   ========================================================= */
function applyRoleUI(role) {
  const isCompany = role === "company";
  document.querySelectorAll('[data-role="student"]').forEach((el) => (el.style.display = isCompany ? "none" : ""));
  document.querySelectorAll('[data-role="company"]').forEach((el) => (el.style.display = isCompany ? "" : "none"));
  document.getElementById("searchInput").placeholder = isCompany ? "Search applicants…" : "Search companies…";
  switchView(isCompany ? "company-dashboard" : "dashboard");
}

/* =========================================================
   DATA LOADING — REAL SUPABASE DATA ONLY
   ========================================================= */
async function loadCompanies() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("companies").select("*").order("name");
  if (error) return [];
  return data || [];
}

async function loadMatches() {
  if (!supabase || !currentUser) return [];
  const { data, error } = await supabase
    .from("matches")
    .select("*, companies(*)")
    .eq("student_id", currentUser.id)
    .order("match_score", { ascending: false });
  if (error) return [];
  return data || [];
}

/* ---------- Matching engine (client-side, real computation) ---------- */
function computeMatch(profile, company) {
  const studentSkills = new Set((profile.skills || []).map((s) => s.toLowerCase()));
  const required = new Set((company.required_skills || []).map((s) => s.toLowerCase()));
  const matched = [...studentSkills].filter((s) => required.has(s));
  const missing = [...required].filter((s) => !studentSkills.has(s));
  const skillRatio = required.size ? matched.length / required.size : 0;
  const skillScore = skillRatio * 60;
  const cgpa = profile.cgpa || 0;
  const cgpaScore = cgpa >= (company.min_cgpa || 0) ? 20 : (cgpa / (company.min_cgpa || 1)) * 20;
  const branch = profile.branch || "";
  const branchScore = (company.required_branches || []).includes(branch) ? 20 : 0;
  const total = Math.round(skillScore + cgpaScore + branchScore);
  const eligible = cgpa >= (company.min_cgpa || 0) && (company.required_branches || []).includes(branch) && skillRatio >= 0.4;
  return {
    match_score: total,
    matched_skills: (company.required_skills || []).filter((s) => matched.includes(s.toLowerCase())),
    missing_skills: (company.required_skills || []).filter((s) => missing.includes(s.toLowerCase())),
    eligible,
    reasoning: `${matched.length}/${required.size} skills matched, CGPA ${cgpa} vs min ${company.min_cgpa}, branch ${branch}`,
  };
}

async function generateAndSaveMatches() {
  if (!supabase || !currentProfile || !allCompanies.length) return [];
  // Delete old matches, recompute
  await supabase.from("matches").delete().eq("student_id", currentUser.id);
  const rows = allCompanies.map((c) => {
    const m = computeMatch(currentProfile, c);
    return {
      student_id: currentUser.id,
      company_id: c.id,
      match_score: m.match_score,
      missing_skills: m.missing_skills,
      matched_skills: m.matched_skills,
      eligible: m.eligible,
      reasoning: m.reasoning,
      status: "matched",
    };
  }).filter((r) => r.match_score > 0);
  if (rows.length) await supabase.from("matches").insert(rows);
  return loadMatches();
}

/* =========================================================
   RENDER — DASHBOARD
   ========================================================= */
function matchTier(m) { return m >= 85 ? "high" : m >= 75 ? "med" : "low"; }

function renderDashboard(matches) {
  allMatches = matches || [];
  if (!allMatches.length) {
    renderEmptyDashboard();
    return;
  }
  const avg = Math.round(allMatches.reduce((s, m) => s + m.match_score, 0) / allMatches.length);
  const high = allMatches.filter((m) => m.match_score >= 85).length;
  animateCount("matchScore", avg, 1000);
  animateCount("companiesMatched", allMatches.length, 1100);
  animateCount("highMatches", high, 1100);
  animateCount("shortlisted", 0, 900);
  setRing("matchRing", avg);
  document.getElementById("matchFoot").textContent = `Across ${allMatches.length} matched companies`;
  document.getElementById("highBar").style.setProperty("--w", (high / allMatches.length) * 100 + "%");
  document.getElementById("shortBar").style.setProperty("--w", "0%");
  renderCompanyTable(allMatches);
  renderWhyList(allMatches);
  renderAIRec(allMatches);
  renderProfileCompletion();
  buildCharts(allMatches);
}

function renderEmptyDashboard() {
  document.getElementById("matchScore").textContent = "0";
  document.getElementById("companiesMatched").textContent = "0";
  document.getElementById("highMatches").textContent = "0";
  document.getElementById("shortlisted").textContent = "0";
  setRing("matchRing", 0);
  document.getElementById("matchFoot").textContent = "Complete your profile to see matches";
  document.getElementById("highBar").style.setProperty("--w", "0%");
  document.getElementById("shortBar").style.setProperty("--w", "0%");
  document.getElementById("companyBody").innerHTML =
    '<tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">No matches yet. Add your skills and CGPA in Profile, then upload a resume.</td></tr>';
  document.getElementById("aiRec").textContent = "Add your skills and CGPA in the Profile page to get AI recommendations.";
  renderProfileCompletion();
}

function renderCompanyTable(matches) {
  const body = document.getElementById("companyBody");
  if (!body) return;
  body.innerHTML = matches.map((m) => {
    const c = m.companies || m;
    const score = m.match_score || m.match || 0;
    return `
    <tr>
      <td><div class="company-cell"><div class="company-logo" style="background:${c.logo_color || "#4f46e5"}">${(c.name || "?").slice(0, 2).toUpperCase()}</div><div><div class="company-name">${c.name}</div><div class="company-sub">${c.tier || "Tier 1"}</div></div></div></td>
      <td><span class="match-pill ${matchTier(score)}">${score}%</span></td>
      <td>₹${c.package_lpa} LPA</td>
      <td>${c.role}</td>
      <td style="max-width:220px;font-size:0.82rem;color:var(--text-soft)">${m.reasoning || m.why || "—"}</td>
      <td><button class="row-btn" data-id="${c.id}">View Details</button></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".row-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const match = matches.find((m) => (m.companies?.id || m.id) === b.dataset.id);
      openCompanyModal(match);
    })
  );
}

function renderWhyList(matches) {
  const ul = document.getElementById("whyList");
  if (!ul || !matches.length) return;
  const top = matches.slice(0, 3);
  ul.innerHTML = top.map((m) => {
    const c = m.companies || m;
    const skills = m.matched_skills || [];
    return `<li>${c.name}: ${skills.length} skill${skills.length !== 1 ? "s" : ""} matched (${(m.matched_skills || []).join(", ") || "none"})</li>`;
  }).join("");
}

function renderAIRec(matches) {
  const el = document.getElementById("aiRec");
  if (!el) return;
  if (!matches.length) { el.textContent = "Add your skills to get AI recommendations."; return; }
  const top = matches[0];
  const c = top.companies || top;
  el.innerHTML = `Prioritise <strong>${c.role}</strong> at <strong>${c.name}</strong> — your top match at ${top.match_score}%. ${
    (top.missing_skills || []).length ? `Close the gap: ${(top.missing_skills || []).join(", ")} to push past 90%.` : "You're fully eligible — apply now."
  }`;
  const apply = document.getElementById("applyRec");
  if (apply) apply.onclick = () => showToast("Applied suggestion to your roadmap", "success");
}

function renderProfileCompletion() {
  let pct = 0;
  const checks = [
    { label: "Resume uploaded", done: false },
    { label: "Skills added", done: false },
    { label: "CGPA added", done: false },
    { label: "Branch selected", done: false },
  ];
  if (currentProfile) {
    if (currentProfile.resume_text) { checks[0].done = true; pct += 25; }
    if (currentProfile.skills && currentProfile.skills.length) { checks[1].done = true; pct += 25; }
    if (currentProfile.cgpa && currentProfile.cgpa > 0) { checks[2].done = true; pct += 25; }
    if (currentProfile.branch) { checks[3].done = true; pct += 25; }
  }
  setRing("profileRing", pct);
  animateCount("profileScore", pct, 1000);
  const ul = document.getElementById("checklist");
  if (ul) ul.innerHTML = checks.map((c) => `<li class="${c.done ? "done" : ""}">${c.label}</li>`).join("");
}

/* =========================================================
   MATCHES VIEW
   ========================================================= */
function renderMatches(matches) {
  const body = document.getElementById("matchBody");
  if (!body) return;
  document.getElementById("matchCount").textContent = `${matches.length} companies`;
  if (!matches.length) {
    body.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;padding:2rem">No matches yet. Complete your profile first.</td></tr>';
    return;
  }
  body.innerHTML = matches.map((m) => {
    const c = m.companies || m;
    return `
    <tr>
      <td><div class="company-cell"><div class="company-logo" style="background:${c.logo_color || "#4f46e5"}">${(c.name || "?").slice(0, 2).toUpperCase()}</div><div><div class="company-name">${c.name}</div><div class="company-sub">${c.tier || "Tier 1"}</div></div></div></td>
      <td><span class="match-pill ${matchTier(m.match_score)}">${m.match_score}%</span></td>
      <td>₹${c.package_lpa} LPA</td>
      <td>${c.role}</td>
      <td style="max-width:200px">${(m.missing_skills || []).length ? (m.missing_skills || []).map((s) => `<span class="skill-tag missing">${s}</span>`).join("") : '<span class="muted">None</span>'}</td>
      <td>${m.eligible ? '<span class="status-dot">Eligible</span>' : '<span class="status-dot review">Review</span>'}</td>
      <td><button class="row-btn" data-id="${c.id}">Apply</button></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".row-btn").forEach((b) =>
    b.addEventListener("click", () => applyToCompany(b.dataset.id))
  );
}

async function applyToCompany(companyId) {
  if (!supabase || !currentUser) { showToast("Sign in to apply", "error"); return; }
  const { error } = await supabase.from("applications").upsert({
    student_id: currentUser.id,
    company_id: companyId,
    status: "applied",
  }, { onConflict: "student_id,company_id" });
  if (error) showToast("Could not apply: " + error.message, "error");
  else showToast("Application submitted", "success");
}

/* =========================================================
   ROADMAP VIEW — derived from real missing skills
   ========================================================= */
function renderRoadmap(matches) {
  const el = document.getElementById("roadmapList");
  if (!el) return;
  const missingMap = {};
  matches.forEach((m) => {
    (m.missing_skills || []).forEach((s) => {
      if (!missingMap[s]) missingMap[s] = [];
      missingMap[s].push((m.companies || m).name);
    });
  });
  const entries = Object.entries(missingMap);
  if (!entries.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">✓</div><p>No skill gaps — you meet all requirements for your matched companies.</p></div>';
    return;
  }
  el.innerHTML = entries
    .sort((a, b) => b[1].length - a[1].length)
    .map(([skill, companies], i) => `
      <div class="roadmap-step">
        <div class="roadmap-num">${i + 1}</div>
        <div class="roadmap-body"><h4>${skill}</h4><p>Required by ${companies.join(", ")}</p></div>
      </div>`).join("");
}

/* =========================================================
   UPLOAD VIEW
   ========================================================= */
function initUpload() {
  const zone = document.getElementById("uploadZone");
  const input = document.getElementById("fileInput");
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault(); zone.classList.remove("drag");
    if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => { if (input.files[0]) handleUpload(input.files[0]); });
}


async function handleUpload(file) {
  const result = document.getElementById("uploadResult");
  result.innerHTML = `<p class="muted"><span class="spinner"></span> Analyzing document with Gemini…</p>`;
  const analysis = await analyzeWithGemini(file);
  if (!analysis) {
    result.innerHTML = `<div class="empty-state"><div class="icon">⚠</div><p>Couldn't analyze this document. Make sure the Gemini API key is set (Vercel → Settings → Environment Variables → GEMINI_API_KEY), then redeploy.</p></div>`;
    const input = document.getElementById("fileInput");
    if (input) input.value = "";
    return;
  }
  renderUploadResult(analysis, file.name, analysis.summary || "");
  const input = document.getElementById("fileInput");
  if (input) input.value = "";
}

async function analyzeWithGemini(file) {
  const base64 = await fileToBase64(file);
  const res = await fetch("/api/analyze-resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_base64: base64, mime_type: file.type || "application/octet-stream", file_name: file.name }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.ai) return null;
  return data.analysis || null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}



function renderUploadResult(data, filename, summary) {
  const result = document.getElementById("uploadResult");
  const skillTags = (data.skills || []).map((s) => `<span class="skill-tag">${s}</span>`).join("");
  const tips = (data.tips || []).map((t) => `<div class="tip-row"><span class="tip-icon warn">!</span><span class="tip-text">${t}</span></div>`).join("");
  const missing = (data.missing_skills || []).map((s) => `<span class="skill-tag missing">${s}</span>`).join("");
  result.innerHTML = `
    <div style="margin-top:1.5rem">
      <h3 style="margin-bottom:0.5rem">Analysis Complete</h3>
      <p class="muted" style="margin-bottom:1rem">${filename} — ${data.document_type || "document"}</p>
      ${summary ? `<p style="margin-bottom:1rem">${summary}</p>` : ""}
      <div style="display:flex;gap:2rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem">
        <div><div class="score-big" style="font-size:2.5rem;color:var(--primary)">${data.score || 0}</div><p class="muted">Document Score</p></div>
        <div><span class="app-status ${data.eligibility ? "shortlisted" : "rejected"}">${data.eligibility ? "Eligible" : "Needs Work"}</span></div>
      </div>
      <h4 style="margin:1rem 0 0.5rem">Detected Skills</h4>
      <div>${skillTags || '<span class="muted">None detected</span>'}</div>
      ${missing ? `<h4 style="margin:1rem 0 0.5rem">Missing Skills to Learn</h4><div>${missing}</div>` : ""}
      ${(data.education || []).length ? `<h4 style="margin:1rem 0 0.5rem">Education</h4><ul style="margin:0 1rem 1rem">${data.education.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}
      ${(data.experience || []).length ? `<h4 style="margin:1rem 0 0.5rem">Experience / Projects</h4><ul style="margin:0 1rem 1rem">${data.experience.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}
      ${(data.achievements || []).length ? `<h4 style="margin:1rem 0 0.5rem">Achievements</h4><ul style="margin:0 1rem 1rem">${data.achievements.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}
      ${tips ? `<h4 style="margin:1rem 0 0.5rem">Improvement Tips</h4>${tips}` : ""}
    </div>`;
  document.getElementById("resumeScore").textContent = data.score || 0;
  document.getElementById("resumeScoreLabel").textContent = data.eligibility ? "Eligible for most roles" : "Build missing skills";
  document.getElementById("resumeSkills").innerHTML = skillTags;
  renderAnalysisBreakdown(data, filename);

  if (supabase && currentProfile) {
    const update = {
      resume_filename: filename,
      resume_text: (summary || "").slice(0, 20000),
      skills: data.skills || [],
      profile_completion: Math.min(100, (currentProfile.profile_completion || 0) + 25),
    };
    if (data.cgpa) update.cgpa = data.cgpa;
    if (data.branch) update.branch = data.branch;
    saveProfile(update).then(({ error }) => {
      if (error) { showToast("Analyzed, but saving to your profile failed: " + error.message, "error"); return; }
      currentProfile.skills = data.skills || [];
      currentProfile.resume_filename = filename;
      currentProfile.resume_text = update.resume_text;
      if (data.cgpa) currentProfile.cgpa = data.cgpa;
      if (data.branch) currentProfile.branch = data.branch;
      renderProfileCompletion();
      regenerateMatches();
      renderNotifications();
      showToast("Document analyzed successfully", "success");
    });
  } else {
    showToast("Document analyzed successfully", "success");
  }
}



function renderAnalysisBreakdown(data, filename) {
  const el = document.getElementById("analysisBreakdown");
  if (!el) return;
  if (!data) {
    el.className = "empty-state";
    el.innerHTML = '<div class="icon">📄</div><p>No document analyzed yet. Upload one to see a detailed breakdown.</p>';
    return;
  }
  const skills = data.skills || [];
  const score = data.score || 0;
  const bars = [
    { label: "Skills Found", val: Math.min(100, skills.length * 10), color: "#10b981" },
    { label: "Eligibility", val: data.eligibility ? 100 : 40, color: "#06b6d4" },
    { label: "Overall Score", val: score, color: "#4f46e5" },
  ];
  el.className = "";
  el.innerHTML = `
    <div style="margin-bottom:1rem">
      <span class="muted">File: ${filename || "document"} — ${data.document_type || ""}</span>
    </div>
    ${data.summary ? `<p style="margin-bottom:1rem">${data.summary}</p>` : ""}
    ${bars.map((b) => `
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">
          <span style="font-weight:500">${b.label}</span>
          <span style="font-weight:600">${b.val}%</span>
        </div>
        <div class="progress-line"><span style="--w:${b.val}%;background:${b.color}"></span></div>
      </div>`).join("")}
    <h4 style="margin:1.25rem 0 0.5rem">Detected Skills (${skills.length})</h4>
    <div>${skills.map((s) => `<span class="skill-tag">${s}</span>`).join("") || '<span class="muted">No skills detected</span>'}</div>
    ${(data.education || []).length ? `<h4 style="margin:1.25rem 0 0.5rem">Education</h4><ul style="margin:0 1rem 1rem">${data.education.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}
    ${(data.experience || []).length ? `<h4 style="margin:1.25rem 0 0.5rem">Experience / Projects</h4><ul style="margin:0 1rem 1rem">${data.experience.map((e) => `<li>${e}</li>`).join("")}</ul>` : ""}
    <h4 style="margin:1.25rem 0 0.5rem">Extracted Info</h4>
    <div class="detail-row"><span class="key">CGPA</span><span class="val">${data.cgpa || "Not detected"}</span></div>
    <div class="detail-row"><span class="key">Branch</span><span class="val">${data.branch || "Not detected"}</span></div>
    <div class="detail-row"><span class="key">Eligibility</span><span class="val">${data.eligibility ? "Eligible" : "Needs improvement"}</span></div>
    ${(data.tips || []).length ? `<h4 style="margin:1.25rem 0 0.5rem">Improvement Tips</h4>${data.tips.map((t) => `<div class="tip-row"><span class="tip-icon warn">!</span><span class="tip-text">${t}</span></div>`).join("")}` : ""}`;
}

async function regenerateMatches() {
  if (!supabase || !currentProfile) return;
  allMatches = await generateAndSaveMatches();
  renderDashboard(allMatches);
  renderMatches(allMatches);
  renderRoadmap(allMatches);
}

/* =========================================================
   APPLICATIONS VIEW
   ========================================================= */
async function loadApplications() {
  const body = document.getElementById("appBody");
  if (!body) return;
  if (!supabase || !currentProfile) {
    body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:2rem">Sign in to track applications</td></tr>';
    return;
  }

  // Fetch company applications + legacy applications in parallel
  const [coRes, legacyRes] = await Promise.all([
    supabase.from("company_applications").select("*").eq("student_id", currentUser.id).order("created_at", { ascending: false }),
    supabase.from("applications").select("*, companies(*)").eq("student_id", currentUser.id).order("applied_at", { ascending: false }),
  ]);
  const coApps = coRes.data || [];
  const legacyApps = legacyRes.data || [];

  // Fetch related company profiles and jobs separately (avoids FK-dependent nested joins)
  const coIds = [...new Set(coApps.map((a) => a.company_id).filter(Boolean))];
  const jobIds = [...new Set(coApps.map((a) => a.job_id).filter(Boolean))];
  const [coProfRes, jobsRes] = await Promise.all([
    coIds.length ? supabase.from("company_profiles").select("*").in("id", coIds) : Promise.resolve({ data: [] }),
    jobIds.length ? supabase.from("jobs").select("*").in("id", jobIds) : Promise.resolve({ data: [] }),
  ]);
  const coMap = Object.fromEntries((coProfRes.data || []).map((p) => [p.id, p]));
  const jobMap = Object.fromEntries((jobsRes.data || []).map((j) => [j.id, j]));

  const legacyRows = (legacyApps).map((a) => `
    <tr>
      <td><div class="company-cell"><div class="company-logo" style="background:${a.companies?.logo_color || "#4f46e5"}">${(a.companies?.name || "?").slice(0, 2).toUpperCase()}</div><div class="company-name">${a.companies?.name || "—"}</div></div></td>
      <td>${a.companies?.role || "—"}</td>
      <td>₹${a.companies?.package_lpa || 0} LPA</td>
      <td><span class="app-status ${a.status}">${a.status}</span></td>
      <td>${new Date(a.applied_at).toLocaleDateString()}</td>
    </tr>`);

  const coRows = coApps.map((a) => {
    const job = jobMap[a.job_id] || {};
    const co = coMap[a.company_id] || {};
    return `
    <tr>
      <td><div class="company-cell"><div class="company-logo" style="background:${co.avatar_url ? `url(${co.avatar_url}) center/cover` : "#4f46e5"}">${co.avatar_url ? "" : (co.org_name || "?").slice(0, 2).toUpperCase()}</div><div class="company-name">${co.org_name || "Company"}</div></div></td>
      <td>${job.role || job.job_name || "—"}</td>
      <td>${job.package_lpa ? `₹${job.package_lpa} LPA` : "—"}</td>
      <td><span class="app-status ${a.status}">${a.status}</span></td>
      <td>${new Date(a.created_at).toLocaleDateString()}</td>
    </tr>`;
  }).join("");

  const rows = [...coRows, ...legacyRows];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center;padding:2rem">No applications yet. Apply from the Matches page or a Company profile.</td></tr>';
    return;
  }
  body.innerHTML = rows.join("");
}

/* =========================================================
   SIMULATOR VIEW
   ========================================================= */
function initSimulator() {
  const run = document.getElementById("simRun");
  if (!run) return;
  const cgpaSlider = document.getElementById("simCgpa");
  const cgpaVal = document.getElementById("simCgpaVal");
  cgpaSlider.addEventListener("input", () => (cgpaVal.textContent = parseFloat(cgpaSlider.value).toFixed(1)));
  run.addEventListener("click", runSimulation);
}

function runSimulation() {
  const cgpa = parseFloat(document.getElementById("simCgpa").value);
  const skills = document.getElementById("simSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
  const branch = document.getElementById("simBranch").value;
  const result = document.getElementById("simResult");
  if (!allCompanies.length) { result.innerHTML = '<p class="muted">No company data loaded.</p>'; return; }
  const fakeProfile = { skills, cgpa, branch };
  const matches = allCompanies.map((c) => {
    const m = computeMatch(fakeProfile, c);
    return { ...c, match_score: m.match_score, missing_skills: m.missing_skills, companies: c };
  }).sort((a, b) => b.match_score - a.match_score);
  result.innerHTML = matches.map((m) => `
    <div class="sim-bar">
      <span class="label">${m.name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${m.match_score}%"></div></div>
      <span class="val">${m.match_score}%</span>
    </div>`).join("");
  showToast("Simulation complete", "info");
}

/* =========================================================
   ANALYTICS / ADMIN VIEW — REAL DATA ONLY
   ========================================================= */
async function loadAnalytics() {
  const statsEl = document.getElementById("adminStats");
  if (!statsEl) return;

  if (!supabase) {
    statsEl.innerHTML = '<div class="card" style="grid-column:1/-1"><p class="muted">Sign in to view analytics.</p></div>';
    document.getElementById("atRiskList").innerHTML = '<p class="muted">No data available.</p>';
    return;
  }

  if (currentProfile?.role !== "admin") {
    statsEl.innerHTML = '<div class="card" style="grid-column:1/-1"><p class="muted">Analytics is only available to placement cell admins. Ask an admin to promote your account if you need access.</p></div>';
    document.getElementById("atRiskList").innerHTML = "";
    return;
  }

  statsEl.innerHTML = `
    <div class="card stat-card fade-in admin-stat"><span class="stat-label">Total Students</span><div class="big-num" id="aTotal">…</div></div>
    <div class="card stat-card fade-in admin-stat"><span class="stat-label">Avg Profile Completion</span><div class="big-num" id="aAvg">…</div></div>
    <div class="card stat-card fade-in admin-stat"><span class="stat-label">At-Risk Students</span><div class="big-num" id="aRisk">…</div></div>
    <div class="card stat-card fade-in admin-stat"><span class="stat-label">Companies Hiring</span><div class="big-num" id="aComp">…</div></div>`;

  const { data: students, error } = await supabase.from("profiles").select("*").eq("role", "student");
  if (error) {
    statsEl.innerHTML = '<div class="card" style="grid-column:1/-1"><p class="muted">Could not load analytics data.</p></div>';
    return;
  }

  const total = students.length;
  const avg = total ? Math.round(students.reduce((s, p) => s + (p.profile_completion || 0), 0) / total) : 0;
  const atRiskStudents = students.filter((p) => (p.profile_completion || 0) < 50);
  const atRisk = atRiskStudents.length;
  const { count: companyCount } = await supabase.from("companies").select("*", { count: "exact", head: true });

  animateCount("aTotal", total, 1000);
  animateCount("aAvg", avg, 1000);
  animateCount("aRisk", atRisk, 1000);
  animateCount("aComp", companyCount || 0, 1000);

  const atRiskEl = document.getElementById("atRiskList");
  if (atRiskEl) {
    if (!atRiskStudents.length) {
      atRiskEl.innerHTML = '<p class="muted">No at-risk students. All profiles are above 50% completion.</p>';
    } else {
      atRiskEl.innerHTML = atRiskStudents.map((s) => `
        <div class="at-risk-row">
          <div><strong>${s.full_name || s.email}</strong><br><span class="muted">${s.branch || "No branch"} · CGPA ${s.cgpa || "—"}</span></div>
          <span class="match-pill low">${s.profile_completion || 0}%</span>
        </div>`).join("");
    }
  }
  buildAnalyticsCharts(students);
}

function buildAnalyticsCharts(students) {
  if (typeof Chart === "undefined") return;
  const c = themeColors(localStorage.getItem(THEME_KEY) || "light");

  // Distribution by profile completion
  const buckets = [0, 0, 0, 0, 0];
  students.forEach((s) => {
    const p = s.profile_completion || 0;
    if (p < 25) buckets[0]++;
    else if (p < 50) buckets[1]++;
    else if (p < 75) buckets[2]++;
    else if (p < 90) buckets[3]++;
    else buckets[4]++;
  });

  const distEl = document.getElementById("distChart");
  if (distEl) {
    if (charts.dist) charts.dist.destroy();
    charts.dist = new Chart(distEl.getContext("2d"), {
      type: "bar",
      data: { labels: ["0-25%", "25-50%", "50-75%", "75-90%", "90%+"], datasets: [{ label: "Students", data: buckets, backgroundColor: c.fills, borderRadius: 8 }] },
      options: baseOpts(c),
    });
  }

  // Branch performance
  const branchData = {};
  students.forEach((s) => {
    const b = s.branch || "Unknown";
    if (!branchData[b]) branchData[b] = { sum: 0, count: 0 };
    branchData[b].sum += s.profile_completion || 0;
    branchData[b].count++;
  });
  const branches = Object.keys(branchData);
  const branchAvgs = branches.map((b) => Math.round(branchData[b].sum / branchData[b].count));

  const branchEl = document.getElementById("branchChart");
  if (branchEl) {
    if (charts.branch) charts.branch.destroy();
    charts.branch = new Chart(branchEl.getContext("2d"), {
      type: "bar",
      data: { labels: branches.length ? branches : ["No data"], datasets: [{ label: "Avg Completion %", data: branchAvgs.length ? branchAvgs : [0], backgroundColor: c.primary + "cc", borderRadius: 8 }] },
      options: baseOpts(c),
    });
  }
}

/* =========================================================
   PROFILE VIEW
   ========================================================= */
function initProfileForm() {
  const form = document.getElementById("profileForm");
  if (!form) return;
  if (currentProfile) {
    document.getElementById("pName").value = currentProfile.full_name || "";
    document.getElementById("pCgpa").value = currentProfile.cgpa || "";
    document.getElementById("pBranch").value = currentProfile.branch || "";
    document.getElementById("pEmail").value = currentProfile.email || "";
    document.getElementById("pBio").value = currentProfile.bio || "";
    document.getElementById("pSkills").value = (currentProfile.skills || []).join(", ");
    renderSkillTags();
    if (currentProfile.avatar_url) setMediaPreview("avatarPreview", currentProfile.avatar_url);
    if (currentProfile.banner_url) setMediaPreview("bannerPreview", currentProfile.banner_url);
  }
  document.getElementById("avatarInput").addEventListener("change", (e) => handleMediaUpload(e, "avatar", "avatarPreview"));
  document.getElementById("bannerInput").addEventListener("change", (e) => handleMediaUpload(e, "banner", "bannerPreview"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const skills = document.getElementById("pSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
    const cgpaInput = document.getElementById("pCgpa").value;
    const cgpa = cgpaInput === "" ? 0 : Math.min(10, Math.max(0, parseFloat(cgpaInput) || 0));
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "Saving…";

    const { error } = await saveProfile({
      full_name: document.getElementById("pName").value,
      bio: document.getElementById("pBio").value,
      cgpa,
      branch: document.getElementById("pBranch").value,
      skills,
      profile_completion: Math.min(100, (currentProfile?.profile_completion || 0) + 20),
    });

    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;

    if (error) {
      showToast("Couldn't save profile: " + error.message, "error");
      return;
    }

    if (!currentProfile) currentProfile = { id: currentUser.id, email: currentUser.email };
    currentProfile.skills = skills;
    currentProfile.cgpa = cgpa;
    currentProfile.branch = document.getElementById("pBranch").value;
    currentProfile.full_name = document.getElementById("pName").value;
    currentProfile.bio = document.getElementById("pBio").value;
    renderSkillTags();
    renderProfileCompletion();
    showToast("Profile saved — recalculating matches", "success");
    regenerateMatches();
  });
  document.getElementById("pSkills").addEventListener("input", renderSkillTags);
}

function setMediaPreview(id, url) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.backgroundImage = `url('${url}')`;
  el.innerHTML = "";
}

async function handleMediaUpload(e, type, previewId) {
  const file = e.target.files[0];
  if (!file) return;
  if (!supabase || !currentProfile) { showToast("Sign in to upload images", "error"); return; }
  const bucket = type === "avatar" ? "avatars" : "banners";
  const ext = file.name.split(".").pop();
  const path = `${currentProfile.id}/${type}-${Date.now()}.${ext}`;
  showToast("Uploading…", "info");
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) { showToast("Upload failed: " + upErr.message, "error"); return; }
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  const url = pub.publicUrl;
  const { error: profErr } = await saveProfile({ [`${type}_url`]: url });
  if (profErr) { showToast("Saved image but couldn't update profile: " + profErr.message, "error"); return; }
  currentProfile[`${type}_url`] = url;
  setMediaPreview(previewId, url);
  showToast(`${type === "avatar" ? "Avatar" : "Banner"} saved`, "success");
}

function renderSkillTags() {
  const el = document.getElementById("skillTags");
  if (!el) return;
  const skills = document.getElementById("pSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
  el.innerHTML = skills.map((s) => `<span class="skill-tag">${s}</span>`).join("");
}

/* =========================================================
   CHARTS
   ========================================================= */
function themeColors(theme) {
  if (theme === "dark") return { text: "#cbd5e1", grid: "rgba(148,163,184,0.15)", primary: "#6366f1", accent: "#22d3ee", fills: ["#6366f1", "#22d3ee", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"] };
  if (theme === "aurora") return { text: "rgba(255,255,255,0.85)", grid: "rgba(255,255,255,0.18)", primary: "#ffffff", accent: "#67e8f9", fills: ["#ffffff", "#67e8f9", "#6ee7b7", "#fcd34d", "#f0abfc", "#a5b4fc"] };
  return { text: "#475569", grid: "rgba(148,163,184,0.2)", primary: "#4f46e5", accent: "#06b6d4", fills: ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"] };
}

function baseOpts(c) {
  return { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: c.text, boxWidth: 12, padding: 14 } } }, scales: { x: { ticks: { color: c.text }, grid: { color: c.grid } }, y: { ticks: { color: c.text }, grid: { color: c.grid } } } };
}

function buildCharts(matches) {
  if (typeof Chart === "undefined") return;
  const c = themeColors(localStorage.getItem(THEME_KEY) || "light");
  Chart.defaults.font.family = "Inter, sans-serif";
  Chart.defaults.color = c.text;

  // Role demand doughnut — from real matches
  const roleCounts = {};
  matches.forEach((m) => {
    const role = (m.companies || m).role || "Other";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });
  const roleLabels = Object.keys(roleCounts);
  const roleData = Object.values(roleCounts);

  const roleEl = document.getElementById("roleChart");
  if (roleEl) {
    if (charts.role) charts.role.destroy();
    charts.role = new Chart(roleEl.getContext("2d"), {
      type: "doughnut",
      data: { labels: roleLabels.length ? roleLabels : ["No data"], datasets: [{ data: roleData.length ? roleData : [1], backgroundColor: c.fills, borderWidth: 0, hoverOffset: 8 }] },
      options: { ...baseOpts(c), cutout: "68%" },
    });
  }

  // Hiring insights — real matches per company
  const companyLabels = matches.map((m) => (m.companies || m).name?.split(" ")[0] || "?");
  const matchScores = matches.map((m) => m.match_score || 0);

  const insightEl = document.getElementById("insightChart");
  if (insightEl) {
    if (charts.insight) charts.insight.destroy();
    charts.insight = new Chart(insightEl.getContext("2d"), {
      type: "bar",
      data: { labels: companyLabels.length ? companyLabels : ["No data"], datasets: [{ label: "Your Match %", data: matchScores.length ? matchScores : [0], backgroundColor: c.primary + "cc", borderRadius: 8, barThickness: 18 }] },
      options: baseOpts(c),
    });
  }

  // Trend chart — applications over time (real)
  buildTrendChart(c);
}

async function buildTrendChart(c) {
  const trendEl = document.getElementById("trendChart");
  if (!trendEl) return;
  let appData = [];
  if (supabase && currentUser) {
    const { data } = await supabase.from("applications").select("applied_at").eq("student_id", currentUser.id);
    appData = data || [];
  }
  // Group by month
  const months = {};
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en", { month: "short" });
    months[key] = 0;
  }
  appData.forEach((a) => {
    const d = new Date(a.applied_at);
    const key = d.toLocaleDateString("en", { month: "short" });
    if (key in months) months[key]++;
  });
  const labels = Object.keys(months);
  const data = Object.values(months);

  if (charts.trend) charts.trend.destroy();
  const ctx = trendEl.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, c.primary + "55");
  grad.addColorStop(1, c.primary + "00");
  charts.trend = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Applications", data, borderColor: c.primary, backgroundColor: grad, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0, pointHoverRadius: 5 }] },
    options: baseOpts(c),
  });
}

function styleCharts(theme) {
  const c = themeColors(theme);
  if (typeof Chart !== "undefined") Chart.defaults.color = c.text;
  Object.values(charts).forEach((ch) => { if (ch) ch.update(); });
}

/* =========================================================
   MODAL
   ========================================================= */
function openCompanyModal(m) {
  const c = m.companies || m;
  document.getElementById("modalTitle").textContent = c.name;
  document.getElementById("modalBody").innerHTML = `
    <div class="detail-row"><span class="key">Role</span><span class="val">${c.role}</span></div>
    <div class="detail-row"><span class="key">Package</span><span class="val">₹${c.package_lpa} LPA</span></div>
    <div class="detail-row"><span class="key">Match Score</span><span class="val">${m.match_score || 0}%</span></div>
    <div class="detail-row"><span class="key">Why it matches</span><span class="val">${m.reasoning || "—"}</span></div>
    <div class="detail-row"><span class="key">Matched skills</span><span class="val">${(m.matched_skills || []).join(", ") || "None"}</span></div>
    <div class="detail-row"><span class="key">Missing skills</span><span class="val">${(m.missing_skills || []).join(", ") || "None"}</span></div>
    <div class="detail-row"><span class="key">Openings</span><span class="val">${c.openings || "—"}</span></div>
    <div class="detail-row"><span class="key">Eligible</span><span class="val">${m.eligible ? "Yes" : "No"}</span></div>
    <button class="btn-primary" style="margin-top:1rem;width:100%" id="modalApply">Apply Now</button>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalApply").addEventListener("click", () => { applyToCompany(c.id); closeModal(); });
}
function closeModal() { document.getElementById("modalOverlay").classList.remove("show"); }

/* =========================================================
   AI ASSISTANT
   ========================================================= */
const AI_SUGGESTIONS = [
  "What skills should I learn?",
  "Which companies match me best?",
  "How do I improve my match score?",
  "What's my skill gap?",
];

const AI_FAB_HIDDEN_KEY = "spc-ai-fab-hidden";
const AI_FAB_POS_KEY = "spc-ai-fab-pos";

function initAIAssistant() {
  const fab = document.getElementById("aiFab");
  const chat = document.getElementById("aiChat");
  const closeBtn = document.getElementById("aiChatClose");
  const fabCloseBtn = document.getElementById("aiFabClose");
  const sendBtn = document.getElementById("aiSend");
  const input = document.getElementById("aiInput");
  if (!fab || !chat) return;

  // Restore a saved drag position, and whether the user previously dismissed the fab.
  const savedPos = JSON.parse(localStorage.getItem(AI_FAB_POS_KEY) || "null");
  if (savedPos) positionFab(fab, savedPos.x, savedPos.y);
  if (localStorage.getItem(AI_FAB_HIDDEN_KEY) === "1") fab.hidden = true;

  initFabDrag(fab, chat);

  fabCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    fab.hidden = true;
    chat.classList.remove("show");
    localStorage.setItem(AI_FAB_HIDDEN_KEY, "1");
    showToast("AI assistant hidden — reopen it anytime from the sidebar", "info");
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    chat.classList.remove("show");
  });

  initChatDrag(chat);
  sendBtn.addEventListener("click", sendAIMessage);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendAIMessage(); });

  const sideEntry = document.getElementById("sideAiAssistant");
  if (sideEntry) {
    sideEntry.addEventListener("click", (e) => {
      e.preventDefault();
      fab.hidden = false;
      localStorage.removeItem(AI_FAB_HIDDEN_KEY);
      openAIChat();
    });
  }
}

function openAIChat() {
  const chat = document.getElementById("aiChat");
  const body = document.getElementById("aiChatBody");
  chat.classList.add("show");
  if (!body.children.length) {
    addBotMessage("Hi! I'm your AI career assistant. I can suggest skills to learn, explain your matches, and help improve your profile. Ask me anything!");
    renderAISuggestions();
  }
}



/** Drag-to-move for the FAB. A short drag distance is still treated as a click (opens the chat). */
function initFabDrag(fab, chat) {
  let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

  const onDown = (clientX, clientY) => {
    dragging = true; moved = false;
    const rect = fab.getBoundingClientRect();
    origX = rect.left; origY = rect.top;
    startX = clientX; startY = clientY;
    fab.classList.add("dragging");
  };
  const onMove = (clientX, clientY) => {
    if (!dragging) return;
    const dx = clientX - startX, dy = clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const maxX = window.innerWidth - fab.offsetWidth - 8;
    const maxY = window.innerHeight - fab.offsetHeight - 8;
    const x = Math.min(Math.max(8, origX + dx), maxX);
    const y = Math.min(Math.max(8, origY + dy), maxY);
    positionFab(fab, x, y);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    fab.classList.remove("dragging");
    if (moved) {
      const rect = fab.getBoundingClientRect();
      localStorage.setItem(AI_FAB_POS_KEY, JSON.stringify({ x: rect.left, y: rect.top }));
    } else {
      chat.classList.toggle("show");
      if (chat.classList.contains("show")) openAIChat();
    }
  };

  fab.addEventListener("mousedown", (e) => { if (e.target.closest("#aiFabClose")) return; onDown(e.clientX, e.clientY); });
  document.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  document.addEventListener("mouseup", onUp);

  fab.addEventListener("touchstart", (e) => { if (e.target.closest("#aiFabClose")) return; onDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (dragging) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  document.addEventListener("touchend", onUp);
}

function positionFab(fab, x, y) {
  fab.style.left = x + "px";
  fab.style.top = y + "px";
  fab.style.right = "auto";
  fab.style.bottom = "auto";
}

function initChatDrag(chat) {
  const head = chat.querySelector(".ai-chat-head");
  if (!head) return;
  head.style.cursor = "grab";
  let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

  const onDown = (cx, cy) => {
    dragging = true; moved = false;
    startX = cx; startY = cy;
    const rect = chat.getBoundingClientRect();
    origX = rect.left; origY = rect.top;
    head.style.cursor = "grabbing";
  };
  const onMove = (cx, cy) => {
    if (!dragging) return;
    const dx = cx - startX, dy = cy - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const maxX = window.innerWidth - chat.offsetWidth - 8;
    const maxY = window.innerHeight - chat.offsetHeight - 8;
    const x = Math.min(Math.max(8, origX + dx), maxX);
    const y = Math.min(Math.max(8, origY + dy), maxY);
    chat.style.left = x + "px";
    chat.style.top = y + "px";
    chat.style.right = "auto";
    chat.style.bottom = "auto";
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    head.style.cursor = "grab";
  };

  head.addEventListener("mousedown", (e) => {
    if (e.target.closest("#aiChatClose")) return;
    onDown(e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  document.addEventListener("mouseup", onUp);

  head.addEventListener("touchstart", (e) => {
    if (e.target.closest("#aiChatClose")) return;
    onDown(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (dragging) onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  document.addEventListener("touchend", onUp);
}

function renderAISuggestions() {
  const el = document.getElementById("aiSuggestions");
  el.innerHTML = AI_SUGGESTIONS.map((s) => `<button class="ai-suggestion">${s}</button>`).join("");
  el.querySelectorAll(".ai-suggestion").forEach((b) =>
    b.addEventListener("click", () => {
      document.getElementById("aiInput").value = b.textContent;
      sendAIMessage();
    })
  );
}


async function sendAIMessage() {
  const input = document.getElementById("aiInput");
  const text = input.value.trim();
  if (!text) return;
  addUserMessage(text);
  input.value = "";
  document.getElementById("aiSuggestions").innerHTML = "";
  showTyping();

  const reply = await getAIReply(text);

  removeTyping();
  addBotMessage(reply);
  renderAISuggestions();
}

async function getAIReply(question) {
  // Ask the serverless function (Vercel), which holds GEMINI_API_KEY server-side —
  // the key must NEVER live in this browser-side file. If the function isn't
  // available (e.g. running locally via plain `vite` without `vercel dev`) or the
  // key isn't configured yet, fall back to a deterministic rule-based reply so
  // the assistant always works.
  try {
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, profile: currentProfile, matches: allMatches }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ai && data.reply) return data.reply;
    }
  } catch (err) {
    // Not deployed / not running on Vercel — fall through to the rule-based reply.
  }

  // Deterministic rule-based fallback — always works, no API key needed.
  return ruleBasedReply(question);
}

function ruleBasedReply(question) {
  const q = question.toLowerCase();
  const skills = currentProfile?.skills || [];
  const cgpa = currentProfile?.cgpa || 0;
  const branch = currentProfile?.branch || "";
  const matches = allMatches || [];

  if (/hi|hello|hey/.test(q)) {
    return `<strong>Hi there!</strong><br><br>I'm your AI career assistant. I can help with skills, company matches, and profile tips. What would you like to know?`;
  }
  if (/skill|learn|study/.test(q)) {
    const missing = [...new Set(matches.flatMap((m) => m.missing_skills || []))];
    if (missing.length) return `<strong>To boost your matches, focus on:</strong><br>${missing.slice(0, 5).map((s) => `• ${s}`).join("<br>")}`;
    return `<strong>Your skills look solid.</strong><br><br>Keep practicing ${skills.slice(0, 3).join(", ") || "your core skills"} and build projects to stand out.`;
  }
  if (/match|company|best/.test(q)) {
    if (!matches.length) return `<strong>No matches yet.</strong><br><br>Add your skills and CGPA in the Profile page to get matched with companies.`;
    const top = matches[0];
    const c = top.companies || top;
    return `<strong>Your top match is ${c.name}.</strong><br><br>${c.role} at ₹${c.package_lpa} LPA — ${top.match_score}% match. ${(top.missing_skills || []).length ? `Close the gap: ${(top.missing_skills || []).join(", ")}.` : "You're fully eligible — apply now!"}`;
  }
  if (/score|improve|better/.test(q)) {
    if (!matches.length) return `<strong>Complete your profile to get a match score.</strong><br><br>Add skills, CGPA, and branch in the Profile page.`;
    const avg = Math.round(matches.reduce((s, m) => s + m.match_score, 0) / matches.length);
    return `<strong>Your average match is ${avg}%.</strong><br><br>${avg >= 75 ? "Great scores! Apply to your top matches." : "Add more relevant skills to push your scores higher."}`;
  }
  if (/cgpa|grade/.test(q)) {
    return `<strong>Your CGPA is ${cgpa || "not set"}.</strong><br><br>${cgpa >= 7.5 ? "That meets most companies' requirements." : "Aim for 7.5+ to unlock more opportunities."}`;
  }
  return `<strong>I'm here to help!</strong><br><br>Ask me about skills to learn, your best company matches, how to improve your score, or your CGPA.<br><br><button class="ai-suggestion" onclick="document.getElementById('aiInput').value='What skills should I learn?'; sendAIMessage();">What skills should I learn?</button>`;
}

function addBotMessage(text) {
  const body = document.getElementById("aiChatBody");
  const div = document.createElement("div");
  div.className = "ai-msg bot";
  div.innerHTML = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function addUserMessage(text) {
  const body = document.getElementById("aiChatBody");
  const div = document.createElement("div");
  div.className = "ai-msg user";
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function showTyping() {
  const body = document.getElementById("aiChatBody");
  const div = document.createElement("div");
  div.className = "ai-msg bot typing";
  div.id = "typingIndicator";
  div.innerHTML = "<span></span><span></span><span></span>";
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}



/* =========================================================
   HELPERS
   ========================================================= */
function animateCount(id, target, dur = 1000) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setRing(id, percent, circumference = 327) {
  const ring = document.getElementById(id);
  if (!ring) return;
  ring.style.strokeDashoffset = circumference - (percent / 100) * circumference;
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function initSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;
  let searchResults = null;
  let debounceTimer = null;

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      if (searchResults) { searchResults.remove(); searchResults = null; }
      return;
    }
    debounceTimer = setTimeout(() => performSearch(q), 250);
  });

  async function performSearch(query) {
    const ql = query.toLowerCase();
    if (currentProfile?.role === "company") {
      // Company searches for applicants (students who applied to them)
      const { data } = await supabase
        .from("company_applications")
        .select("full_name, email, phone, status, student_id")
        .eq("company_id", currentUser.id)
        .ilike("full_name", `%${query}%`);
      renderSearchResults((data || []).map((a) => ({ name: a.full_name, bio: a.email, contact: a.phone, type: "student", id: a.student_id, status: a.status })), query);
    } else {
      // Student searches for companies by name
      const { data } = await supabase
        .from("company_profiles")
        .select("*")
        .ilike("org_name", `%${query}%`);
      renderSearchResults((data || []).map((c) => ({ name: c.org_name, bio: c.industry || c.about_us?.slice(0, 80) || "", contact: c.contact_email, type: "company", id: c.id, avatar_url: c.avatar_url, obj: c })), query);
    }
  }

  function renderSearchResults(results, query) {
    if (!searchResults) {
      searchResults = document.createElement("div");
      searchResults.className = "card fade-in";
      searchResults.style.cssText = "position:absolute; top:100%; left:0; right:0; z-index:50; max-height:400px; overflow-y:auto; margin-top:4px;";
      input.parentElement.style.position = "relative";
      input.parentElement.appendChild(searchResults);
    }
    if (!results.length) {
      searchResults.innerHTML = `<div style="padding:1rem" class="muted">No results for "${query}"</div>`;
      return;
    }
    searchResults.innerHTML = results.map((r) => {
      const avatarStyle = r.avatar_url ? `background-image:url(${r.avatar_url})` : "";
      const avatarClass = r.avatar_url ? "search-result-avatar" : "search-result-avatar";
      const initials = (r.name || "?").slice(0, 2).toUpperCase();
      const bio = r.bio ? (r.bio.length > 60 ? r.bio.slice(0, 60) + "…" : r.bio) : "—";
      const contactLabel = r.type === "company" ? "View & Contact" : "Message";
      return `
        <div class="search-result-row">
          <div class="${avatarClass}" style="${avatarStyle}">${r.avatar_url ? "" : initials}</div>
          <div class="search-result-body">
            <div class="search-result-name">${r.name || "—"}</div>
            <div class="search-result-bio">${bio}</div>
          </div>
          <div class="search-result-contact">
            ${r.type === "company"
              ? `<button class="btn-primary btn-sm" data-view-company="${r.id}">View & Contact</button>`
              : `<button class="btn-primary btn-sm" data-msg-user="${r.id}">Message</button>`}
          </div>
        </div>`;
    }).join("");
    searchResults.querySelectorAll("[data-view-company]").forEach((b) => b.addEventListener("click", () => {
      const c = results.find((x) => x.id === b.dataset.viewCompany);
      if (c?.obj) openCompanyPublic(c.obj);
      searchResults.remove(); searchResults = null; input.value = "";
    }));
    searchResults.querySelectorAll("[data-msg-user]").forEach((b) => b.addEventListener("click", async () => {
      const studentId = b.dataset.msgUser;
      const { data: prof } = await supabase.from("profiles").select("full_name, email").eq("id", studentId).maybeSingle();
      await startConversation(studentId, prof?.full_name || prof?.email || "Student");
      switchView("messages");
      searchResults.remove(); searchResults = null; input.value = "";
    }));
  }

  // Close search results when clicking outside
  document.addEventListener("click", (e) => {
    if (searchResults && !input.parentElement.contains(e.target)) {
      searchResults.remove(); searchResults = null;
    }
  });
}

function initChips() {
  document.querySelectorAll(".filter-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const f = chip.dataset.filter;
      let list = allMatches;
      if (f === "high") list = list.filter((m) => m.match_score >= 85);
      else if (f === "medium") list = list.filter((m) => m.match_score >= 75 && m.match_score < 85);
      else if (f === "low") list = list.filter((m) => m.match_score < 75);
      renderCompanyTable(list);
    });
  });
}

function populateProfileUI() {
  if (!currentProfile) return;
  const roleLabel = currentProfile.role
    ? currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1)
    : "Student";
  document.getElementById("profileName").textContent = currentProfile.full_name || (currentProfile.role === "company" ? "Company" : "Student");
  const avatarEl = document.getElementById("avatar");
  if (currentProfile.avatar_url) {
    avatarEl.style.backgroundImage = `url(${currentProfile.avatar_url})`;
    avatarEl.textContent = "";
  } else {
    avatarEl.style.backgroundImage = "";
    avatarEl.textContent = (currentProfile.full_name || "U").slice(0, 2).toUpperCase();
  }
  document.getElementById("setName").textContent = currentProfile.full_name || "—";
  document.getElementById("setEmail").textContent = currentProfile.email || "—";
  document.getElementById("setRole").textContent = roleLabel;
  document.getElementById("setBranch").textContent = currentProfile.branch || "—";
}

/* =========================================================
   BOOT — DASHBOARD
   ========================================================= */
async function initDashboard() {
  initTheme();
  initThemeSwitcher();
  initSupabase();
  initSidebar();
  initSearch();
  initChips();
  initUpload();
  initSimulator();
  initAIAssistant();
  initNotifications();
  closeModal();
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  document.getElementById("signOutBtn").addEventListener("click", (e) => { e.preventDefault(); signOut(); });
  document.getElementById("signOutBtn2").addEventListener("click", signOut);
  document.getElementById("refreshApps").addEventListener("click", loadApplications);

  if (!supabase) {
    window.location.href = "login.html";
    return;
  }
  const authed = await requireAuth();
  if (!authed) return;
  await loadProfile();
  populateProfileUI();
  initProfileForm();
  initCompanyFeatures();
  initMessaging();

  if (currentProfile?.role === "company") {
    applyRoleUI("company");
    await loadCompanyOverview();
    await loadCompanyProfileForm();
  } else {
    applyRoleUI(currentProfile?.role || "student");
    // Load real companies and matches from Supabase
    allCompanies = await loadCompanies();
    allMatches = await loadMatches();

    // If no matches exist yet but profile has skills, generate them
    if (!allMatches.length && currentProfile && (currentProfile.skills?.length || currentProfile.cgpa)) {
      allMatches = await generateAndSaveMatches();
    }

    renderDashboard(allMatches);
    renderMatches(allMatches);
    renderRoadmap(allMatches);
  }

  await renderNotifications();
}

/* =========================================================
   FILE STORAGE HELPERS
   ========================================================= */
async function uploadPublicFile(bucket, file) {
  if (!supabase || !currentUser || !file) return null;
  const path = `${currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) { showToast("Upload failed: " + error.message, "error"); return null; }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function uploadPrivateFile(bucket, file) {
  if (!supabase || !currentUser || !file) return null;
  const path = `${currentUser.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) { showToast("Upload failed: " + error.message, "error"); return null; }
  return path;
}

async function openPrivateFile(bucket, path) {
  if (!supabase || !path) { showToast("File not available", "error"); return; }
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) { showToast("Could not open file: " + (error?.message || "not found"), "error"); return; }
  const url = URL.createObjectURL(data);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* =========================================================
   COMPANY PROFILE — setup, editing, tracker
   ========================================================= */
let currentCompanyProfile = null;

function initCompanyFeatures() {
  const becomeBtn = document.getElementById("becomeCompanyBtn");
  if (becomeBtn) becomeBtn.addEventListener("click", becomeCompany);

  const form = document.getElementById("companyProfileForm");
  if (form) form.addEventListener("submit", saveCompanyProfileForm);

  const bannerInput = document.getElementById("coBannerInput");
  if (bannerInput) bannerInput.addEventListener("change", async () => {
    if (!bannerInput.files[0]) return;
    const url = await uploadPublicFile("banners", bannerInput.files[0]);
    if (!url) return;
    document.getElementById("coBannerPreview").style.backgroundImage = `url(${url})`;
    await supabase.from("company_profiles").upsert({ id: currentUser.id, banner_url: url }, { onConflict: "id" });
    if (currentCompanyProfile) currentCompanyProfile.banner_url = url;
    showToast("Banner updated", "success");
  });

  const avatarInput = document.getElementById("coAvatarInput");
  if (avatarInput) avatarInput.addEventListener("change", async () => {
    if (!avatarInput.files[0]) return;
    const url = await uploadPublicFile("avatars", avatarInput.files[0]);
    if (!url) return;
    document.getElementById("coAvatarPreview").style.backgroundImage = `url(${url})`;
    document.getElementById("coAvatarPreview").textContent = "";
    await supabase.from("company_profiles").upsert({ id: currentUser.id, avatar_url: url }, { onConflict: "id" });
    await saveProfile({ avatar_url: url });
    if (currentCompanyProfile) currentCompanyProfile.avatar_url = url;
    if (!currentProfile) currentProfile = { id: currentUser.id, email: currentUser.email };
    currentProfile.avatar_url = url;
    populateProfileUI();
    showToast("Logo updated", "success");
  });

  const backBtn = document.getElementById("backToCompanies");
  if (backBtn) backBtn.addEventListener("click", () => switchView("companies"));

  const viewAllBtn = document.getElementById("coViewAllApplicants");
  if (viewAllBtn) viewAllBtn.addEventListener("click", () => switchView("applicants"));

  initJobs();
}

async function becomeCompany() {
  if (!supabase || !currentUser) return;
  if (!confirm("Switch this account to a Company account? You'll get a Company Profile, Applicants, and Messages instead of the student dashboard. You can keep using the same login.")) return;
  const { error: profErr } = await supabase
    .from("profiles")
    .upsert({ id: currentUser.id, email: currentUser.email, role: "company" }, { onConflict: "id" });
  if (profErr) { showToast("Couldn't switch account: " + profErr.message, "error"); return; }
  await supabase.from("company_profiles").upsert({ id: currentUser.id }, { onConflict: "id", ignoreDuplicates: true });
  if (!currentProfile) currentProfile = { id: currentUser.id, email: currentUser.email };
  currentProfile.role = "company";
  populateProfileUI();
  showToast("Company account ready — set up your profile", "success");
  applyRoleUI("company");
  await loadCompanyProfileForm();
  await loadCompanyOverview();
}

async function loadCompanyProfileForm() {
  if (!supabase || !currentUser) return;
  const { data } = await supabase.from("company_profiles").select("*").eq("id", currentUser.id).maybeSingle();
  currentCompanyProfile = data || null;
  const f = (id) => document.getElementById(id);
  if (!f("companyProfileForm")) return;
  f("coOrgName").value = currentCompanyProfile?.org_name || "";
  f("coIndustry").value = currentCompanyProfile?.industry || "";
  f("coBio").value = currentCompanyProfile?.about_us || "";
  f("coAddress").value = currentCompanyProfile?.address || "";
  f("coWebsite").value = currentCompanyProfile?.website || "";
  f("coEmail").value = currentCompanyProfile?.contact_email || "";
  f("coPhone").value = currentCompanyProfile?.contact_phone || "";
  if (currentCompanyProfile?.banner_url) f("coBannerPreview").style.backgroundImage = `url(${currentCompanyProfile.banner_url})`;
  if (currentCompanyProfile?.avatar_url) {
    f("coAvatarPreview").style.backgroundImage = `url(${currentCompanyProfile.avatar_url})`;
    f("coAvatarPreview").textContent = "";
  } else {
    f("coAvatarPreview").textContent = (currentCompanyProfile?.org_name || "CO").slice(0, 2).toUpperCase();
  }
}

async function saveCompanyProfileForm(e) {
  e.preventDefault();
  if (!supabase || !currentUser) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Saving…";
  const payload = {
    id: currentUser.id,
    org_name: document.getElementById("coOrgName").value.trim(),
    industry: document.getElementById("coIndustry").value.trim(),
    about_us: document.getElementById("coBio").value.trim(),
    address: document.getElementById("coAddress").value.trim(),
    website: document.getElementById("coWebsite").value.trim(),
    contact_email: document.getElementById("coEmail").value.trim(),
    contact_phone: document.getElementById("coPhone").value.trim(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("company_profiles").upsert(payload, { onConflict: "id" });
  btn.disabled = false;
  btn.textContent = original;
  if (error) { showToast("Couldn't save company profile: " + error.message, "error"); return; }
  currentCompanyProfile = { ...currentCompanyProfile, ...payload };
  if (payload.org_name && (!currentProfile || payload.org_name !== currentProfile.full_name)) {
    await saveProfile({ full_name: payload.org_name });
    if (!currentProfile) currentProfile = { id: currentUser.id, email: currentUser.email };
    currentProfile.full_name = payload.org_name;
    populateProfileUI();
  }
  showToast("Company profile saved — it's now visible to students", "success");
}

/* =========================================================
   COMPANY OVERVIEW (company dashboard)
   ========================================================= */
async function loadCompanyOverview() {
  if (!supabase || !currentUser) return;
  const { data: apps } = await supabase.from("company_applications").select("*").eq("company_id", currentUser.id).order("created_at", { ascending: false });
  const all = apps || [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount = all.filter((a) => new Date(a.created_at).getTime() >= weekAgo).length;
  const shortlisted = all.filter((a) => a.status === "shortlisted").length;
  animateCount("coTotalApplicants", all.length, 900);
  animateCount("coNewApplicants", recentCount, 900);
  animateCount("coShortlisted", shortlisted, 900);

  const recentEl = document.getElementById("coRecentApplicants");
  if (!recentEl) return;
  const recent = all.slice(0, 5);
  recentEl.innerHTML = recent.length ? recent.map((a) => `
    <div class="applicant-row">
      <div><strong>${a.full_name || "Applicant"}</strong><br><span class="muted">${a.email || "—"}</span></div>
      <span class="app-status ${a.status}">${a.status}</span>
      <span class="muted">${new Date(a.created_at).toLocaleDateString()}</span>
    </div>`).join("") : '<p class="muted">No applicants yet.</p>';
}

/* =========================================================
   COMPANIES BROWSE + PUBLIC PROFILE (student side)
   ========================================================= */
let allCompanyProfiles = [];
let currentPublicCompany = null;

async function loadCompanyBrowse() {
  if (!supabase) return;
  const { data } = await supabase.from("company_profiles").select("*").not("org_name", "eq", "").order("updated_at", { ascending: false });
  allCompanyProfiles = data || [];
  const grid = document.getElementById("companyGrid");
  const count = document.getElementById("coBrowseCount");
  if (count) count.textContent = `${allCompanyProfiles.length} compan${allCompanyProfiles.length === 1 ? "y" : "ies"}`;
  if (!grid) return;
  renderCompanyBrowseGrid(allCompanyProfiles);
}

function renderCompanyBrowseGrid(list) {
  const grid = document.getElementById("companyGrid");
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = '<p class="muted">No companies found.</p>';
    return;
  }
  grid.innerHTML = list.map((c) => `
    <div class="company-browse-card glass-soft" data-id="${c.id}">
      <div class="cbc-banner" style="${c.banner_url ? `background-image:url(${c.banner_url})` : ""}"></div>
      <div class="cbc-avatar" style="${c.avatar_url ? `background-image:url(${c.avatar_url})` : ""}">${c.avatar_url ? "" : (c.org_name || "CO").slice(0, 2).toUpperCase()}</div>
      <div class="cbc-body">
        <h3>${c.org_name || "Unnamed Company"}</h3>
      </div>
    </div>`).join("");
  grid.querySelectorAll(".company-browse-card").forEach((card) =>
    card.addEventListener("click", () => {
      const c = allCompanyProfiles.find((x) => x.id === card.dataset.id);
      if (c) openCompanyPublic(c);
    })
  );
}

function openCompanyPublic(c) {
  currentPublicCompany = c;
  document.getElementById("pubOrgName").textContent = c.org_name || "Unnamed Company";
  document.getElementById("pubIndustry").textContent = c.industry || "—";
  document.getElementById("pubBio").textContent = c.about_us || "This company hasn't added a description yet.";
  document.getElementById("pubBanner").style.backgroundImage = c.banner_url ? `url(${c.banner_url})` : "";
  const avatarEl = document.getElementById("pubAvatar");
  if (c.avatar_url) { avatarEl.style.backgroundImage = `url(${c.avatar_url})`; avatarEl.textContent = ""; }
  else { avatarEl.style.backgroundImage = ""; avatarEl.textContent = (c.org_name || "CO").slice(0, 2).toUpperCase(); }
  document.getElementById("pubAddress").textContent = c.address || "—";
  document.getElementById("pubEmail").textContent = c.contact_email || "—";
  document.getElementById("pubPhone").textContent = c.contact_phone || "—";
  document.getElementById("pubWebsite").textContent = c.website || "—";
  loadPublicJobs(c.id);
  switchView("company-public");
}

/* =========================================================
   APPLY NOW — student applies to a company profile
   ========================================================= */
function openApplyModal(company, job) {
  if (!currentUser) { showToast("Sign in to apply", "error"); return; }
  const jobName = job ? `${job.job_name} — ${job.role || ""}` : "";
  document.getElementById("modalTitle").textContent = `Apply to ${company.org_name || "this company"}${job ? " · " + (job.job_name || job.role || "") : ""}`;
  document.getElementById("modalBody").innerHTML = `
    <form id="applyForm">
      ${job ? `<div class="form-row"><label>Job</label><input type="text" value="${(job.job_name || "").replace(/"/g, "&quot;")} — ${(job.role || "").replace(/"/g, "&quot;")} · ₹${job.package_lpa || "—"} LPA" readonly /></div>` : ""}
      <div class="form-row"><label>Full name</label><input type="text" id="apName" required value="${(currentProfile?.full_name || "").replace(/"/g, "&quot;")}" /></div>
      <div class="form-row"><label>Address</label><input type="text" id="apAddress" placeholder="City, State" /></div>
      <div class="form-grid-2">
        <div class="form-row"><label>Phone</label><input type="text" id="apPhone" placeholder="+91 …" /></div>
        <div class="form-row"><label>Email</label><input type="email" id="apEmail" value="${(currentProfile?.email || "").replace(/"/g, "&quot;")}" /></div>
      </div>
      <div class="form-row">
        <label>Resume (PDF or image)</label>
        <input type="file" id="apResume" accept=".pdf,image/*" required />
      </div>
      <div class="form-row"><label>Comment (optional)</label><textarea id="apComment" rows="3" placeholder="Anything else you'd like to add…"></textarea></div>
      <button type="submit" class="btn-primary" id="apSubmit" style="width:100%">Submit Application</button>
    </form>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("applyForm").addEventListener("submit", (e) => submitApplication(e, company, job));
}

async function submitApplication(e, company, job) {
  e.preventDefault();
  const btn = document.getElementById("apSubmit");
  const file = document.getElementById("apResume").files[0];
  if (!file) { showToast("Please attach your resume", "error"); return; }
  btn.disabled = true;
  btn.textContent = "Submitting…";
  const resumePath = await uploadPrivateFile("resumes", file);
  if (!resumePath) { btn.disabled = false; btn.textContent = "Submit Application"; return; }
  await supabase.from("profiles").upsert(
    { id: currentUser.id, email: currentUser.email, full_name: document.getElementById("apName").value.trim() },
    { onConflict: "id" }
  );
  const payload = {
    company_id: company.id,
    student_id: currentUser.id,
    full_name: document.getElementById("apName").value.trim(),
    address: document.getElementById("apAddress").value.trim(),
    phone: document.getElementById("apPhone").value.trim(),
    email: document.getElementById("apEmail").value.trim(),
    resume_url: resumePath,
    resume_filename: file.name,
    comment: document.getElementById("apComment").value.trim(),
    status: "pending",
  };
  if (job) payload.job_id = job.id;
  const { data, error } = await supabase.from("company_applications").insert(payload).select().maybeSingle();
  btn.disabled = false;
  btn.textContent = "Submit Application";
  if (error) { showToast("Couldn't submit application: " + error.message, "error"); return; }
  await supabase.from("notifications").insert({
    user_id: company.id,
    type: "application",
    title: `New application from ${payload.full_name || "a candidate"}`,
    body: `Applied${job ? " for " + (job.job_name || job.role || "a role") : ""} at ${company.org_name}`,
    link_view: "applicants",
    link_id: data?.id || null,
  });
  showToast("Application submitted", "success");
  closeModal();
  if (typeof loadApplications === "function") loadApplications();
}

/* =========================================================
   APPLICANTS VIEW (company side)
   ========================================================= */
let allApplicants = [];

async function loadApplicants() {
  const body = document.getElementById("applicantBody");
  if (!supabase || !currentUser || !body) return;
  const { data } = await supabase.from("company_applications").select("*").eq("company_id", currentUser.id).order("created_at", { ascending: false });
  allApplicants = data || [];
  document.getElementById("applicantCount").textContent = `${allApplicants.length} applicant${allApplicants.length === 1 ? "" : "s"}`;
  if (!allApplicants.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:2rem">No applicants yet. Share your company profile with students.</td></tr>';
    return;
  }
  body.innerHTML = allApplicants.map((a) => `
    <tr>
      <td><strong>${a.full_name || "—"}</strong></td>
      <td>${a.email || "—"}<br><span class="muted">${a.phone || ""}</span></td>
      <td><button class="row-btn" data-resume="${a.id}">View Resume</button></td>
      <td>
        <select class="status-select" data-status="${a.id}">
          ${["submitted", "pending", "viewed", "shortlisted", "rejected", "hired"].map((s) => `<option value="${s}" ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </td>
      <td>${new Date(a.created_at).toLocaleDateString()}</td>
      <td class="applicant-actions">
        <button class="row-btn" data-details="${a.id}">Details</button>
        <button class="row-btn" data-msg="${a.id}">Message</button>
      </td>
    </tr>`).join("");

  body.querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => {
    const a = allApplicants.find((x) => x.id === b.dataset.resume);
    if (a) openPrivateFile("resumes", a.resume_url);
  }));
  body.querySelectorAll(".status-select").forEach((sel) => sel.addEventListener("change", async () => {
    const a = allApplicants.find((x) => x.id === sel.dataset.status);
    const { error } = await supabase.from("company_applications").update({ status: sel.value }).eq("id", a.id);
    if (error) { showToast("Couldn't update status: " + error.message, "error"); return; }
    a.status = sel.value;
    await supabase.from("notifications").insert({
      user_id: a.student_id,
      type: "status",
      title: `Your application is now "${sel.value}"`,
      body: currentCompanyProfile?.org_name || "A company",
      link_view: "applications",
    });
    showToast("Status updated", "success");
  }));
  body.querySelectorAll("[data-details]").forEach((b) => b.addEventListener("click", () => {
    const a = allApplicants.find((x) => x.id === b.dataset.details);
    if (a) openApplicantDetails(a);
  }));
  body.querySelectorAll("[data-msg]").forEach((b) => b.addEventListener("click", () => {
    const a = allApplicants.find((x) => x.id === b.dataset.msg);
    if (a) openConversationWith(a.student_id, a.full_name);
  }));
}

function openApplicantDetails(a) {
  document.getElementById("modalTitle").textContent = a.full_name || "Applicant";
  document.getElementById("modalBody").innerHTML = `
    <div class="detail-row"><span class="key">Full name</span><span class="val">${a.full_name || "—"}</span></div>
    <div class="detail-row"><span class="key">Email</span><span class="val">${a.email || "—"}</span></div>
    <div class="detail-row"><span class="key">Phone</span><span class="val">${a.phone || "—"}</span></div>
    <div class="detail-row"><span class="key">Address</span><span class="val">${a.address || "—"}</span></div>
    <div class="detail-row"><span class="key">Status</span><span class="val">${a.status}</span></div>
    <div class="detail-row"><span class="key">Comment</span><span class="val">${a.comment || "—"}</span></div>
    <button class="btn-primary" id="modalViewResume" style="margin-top:1rem;width:100%">View Resume</button>
    <button class="btn-ghost" id="modalMsgApplicant" style="margin-top:0.5rem;width:100%">Message Candidate</button>`;
  document.getElementById("modalOverlay").classList.add("show");
  document.getElementById("modalViewResume").addEventListener("click", () => openPrivateFile("resumes", a.resume_url));
  document.getElementById("modalMsgApplicant").addEventListener("click", () => { closeModal(); openConversationWith(a.student_id, a.full_name); });
}

/* =========================================================
   MESSAGING — conversations + messages, with attachments
   ========================================================= */
let allConversations = [];
let conversationProfiles = {};
let currentConversation = null;
let messageRealtimeChannel = null;

function initMessaging() {
  const sendBtn = document.getElementById("convSend");
  const input = document.getElementById("convInput");
  const attachInput = document.getElementById("convAttachInput");
  const backBtn = document.getElementById("convBack");
  if (sendBtn) sendBtn.addEventListener("click", sendMessage);
  if (input) input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
  if (attachInput) attachInput.addEventListener("change", () => {
    document.getElementById("convAttachName").textContent = attachInput.files[0]?.name || "";
  });
  if (backBtn) backBtn.addEventListener("click", () => {
    document.getElementById("convThread").classList.remove("mobile-open");
  });
}

async function loadConversations() {
  if (!supabase || !currentUser) return;
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .or(`user_a.eq.${currentUser.id},user_b.eq.${currentUser.id}`)
    .order("last_message_at", { ascending: false });
  allConversations = data || [];
  const otherIds = [...new Set(allConversations.map((c) => (c.user_a === currentUser.id ? c.user_b : c.user_a)))];
  if (otherIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name, email, avatar_url, role").in("id", otherIds);
    conversationProfiles = Object.fromEntries((profs || []).map((p) => [p.id, p]));
  }
  const el = document.getElementById("convItems");
  if (!el) return;
  if (!allConversations.length) {
    el.innerHTML = '<p class="muted" style="padding:1rem">No conversations yet.</p>';
    return;
  }
  el.innerHTML = allConversations.map((c) => {
    const otherId = c.user_a === currentUser.id ? c.user_b : c.user_a;
    const other = conversationProfiles[otherId];
    const name = other?.full_name || other?.email || "User";
    const avatarStyle = other?.avatar_url ? `background-image:url(${other.avatar_url})` : "";
    const avatarClass = other?.avatar_url ? "conv-avatar has-img" : "conv-avatar";
    return `
    <div class="conv-item" data-id="${c.id}" data-name="${name.toLowerCase()}">
      <div class="${avatarClass}" style="${avatarStyle}">${other?.avatar_url ? "" : name.slice(0, 2).toUpperCase()}</div>
      <div class="conv-item-body">
        <div class="conv-item-name">${name}</div>
        <div class="conv-item-preview">${(c.last_message || "No messages yet").slice(0, 40)}</div>
      </div>
    </div>`;
  }).join("");
  el.querySelectorAll(".conv-item").forEach((item) => item.addEventListener("click", () => {
    const c = allConversations.find((x) => x.id === item.dataset.id);
    const otherId = c.user_a === currentUser.id ? c.user_b : c.user_a;
    openConversation(c, conversationProfiles[otherId]?.full_name || "User");
  }));
  // Wire up the search filter
  const searchInput = document.getElementById("convSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase().trim();
      el.querySelectorAll(".conv-item").forEach((item) => {
        const name = item.dataset.name || "";
        item.style.display = !q || name.includes(q) ? "" : "none";
      });
    });
  }
}

/** Finds or creates a conversation with `otherUserId`, then opens it. */
async function openConversationWith(otherUserId, otherName) {
  if (!supabase || !currentUser || !otherUserId) return;
  switchView("messages");
  const [a, b] = [currentUser.id, otherUserId].sort();
  let { data: conv } = await supabase.from("conversations").select("*")
    .eq("user_a", a).eq("user_b", b).maybeSingle();
  if (!conv) {
    const { data: created, error } = await supabase.from("conversations")
      .insert({ user_a: a, user_b: b }).select().maybeSingle();
    if (error) { showToast("Couldn't start conversation: " + error.message, "error"); return; }
    conv = created;
  }
  await loadConversations();
  openConversation(conv, otherName || "User");
}

async function openConversation(conv, otherName) {
  currentConversation = conv;
  document.getElementById("convEmpty").hidden = true;
  document.getElementById("convActive").hidden = false;
  document.getElementById("convThread").classList.add("mobile-open");
  document.getElementById("convWhoName").textContent = otherName;
  await loadMessages(conv.id);
  await supabase.from("messages").update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conv.id).neq("sender_id", currentUser.id).is("read_at", null);
  subscribeToConversation(conv.id);
}

function subscribeToConversation(conversationId) {
  if (messageRealtimeChannel) supabase.removeChannel(messageRealtimeChannel);
  messageRealtimeChannel = supabase
    .channel(`messages-${conversationId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      () => loadMessages(conversationId))
    .subscribe();
}

async function loadMessages(conversationId) {
  const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  const el = document.getElementById("convMessages");
  if (!el) return;
  el.innerHTML = (data || []).map((m) => `
    <div class="msg-bubble ${m.sender_id === currentUser.id ? "mine" : "theirs"}">
      ${m.body ? `<div class="msg-text">${escapeHtml(m.body)}</div>` : ""}
      ${m.attachment_name ? `<button class="msg-attachment" data-bucket="attachments" data-path="${m.attachment_url}">📎 ${m.attachment_name}</button>` : ""}
      <div class="msg-time">${new Date(m.created_at).toLocaleString()}</div>
    </div>`).join("");
  el.querySelectorAll(".msg-attachment").forEach((b) => b.addEventListener("click", () => openPrivateFile(b.dataset.bucket, b.dataset.path)));
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function sendMessage() {
  if (!currentConversation || !currentUser) return;
  const input = document.getElementById("convInput");
  const attachInput = document.getElementById("convAttachInput");
  const body = input.value.trim();
  const file = attachInput.files[0];
  if (!body && !file) return;
  const sendBtn = document.getElementById("convSend");
  sendBtn.disabled = true;

  let attachment_url = "", attachment_name = "", attachment_type = "";
  if (file) {
    const path = await uploadPrivateFile("attachments", file);
    if (path) { attachment_url = path; attachment_name = file.name; attachment_type = file.type; }
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: currentConversation.id,
    sender_id: currentUser.id,
    body,
    attachment_url,
    attachment_name,
    attachment_type,
  });
  sendBtn.disabled = false;
  if (error) { showToast("Couldn't send message: " + error.message, "error"); return; }

  await supabase.from("conversations").update({
    last_message: body || `📎 ${attachment_name}`,
    last_message_at: new Date().toISOString(),
  }).eq("id", currentConversation.id);

  const otherId = currentConversation.user_a === currentUser.id ? currentConversation.user_b : currentConversation.user_a;
  await supabase.from("notifications").insert({
    user_id: otherId,
    type: "message",
    title: `New message from ${currentProfile?.full_name || "someone"}`,
    body: body || `Sent an attachment: ${attachment_name}`,
    link_view: "messages",
    link_id: currentConversation.id,
  });

  input.value = "";
  attachInput.value = "";
  document.getElementById("convAttachName").textContent = "";
  await loadMessages(currentConversation.id);
  await loadConversations();
}

/* =========================================================
   NOTIFICATIONS — built from the student's real current state
   ========================================================= */
const NOTIF_DISMISS_KEY = "spc-notif-dismissed";

function initNotifications() {
  const btn = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");
  const clearBtn = document.getElementById("notifClearBtn");
  if (!btn || !panel) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!panel.hidden && !e.target.closest("#notifWrap")) panel.hidden = true;
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
  clearBtn.addEventListener("click", async () => {
    const all = buildNotifications();
    localStorage.setItem(NOTIF_DISMISS_KEY, JSON.stringify(all.map((n) => n.id)));
    if (supabase && currentUser) {
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", currentUser.id).eq("is_read", false);
    }
    renderNotifications();
  });
}

/** Notifications stored in the DB — new applicants, messages, status changes. */
async function loadDbNotifications() {
  if (!supabase || !currentUser) return [];
  const { data } = await supabase.from("notifications").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }).limit(30);
  const iconFor = { application: "📥", message: "💬", status: "🔔" };
  return (data || []).map((n) => ({
    id: n.id,
    icon: iconFor[n.type] || "🔔",
    title: n.title,
    time: timeAgo(n.created_at),
    link_view: n.link_view,
    is_read: n.is_read,
    fromDb: true,
  }));
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Derives a small list of real, current notifications from profile/match state. */
function buildNotifications() {
  const notifs = [];
  const completion = currentProfile?.profile_completion || 0;

  if (allMatches?.length) {
    const strong = allMatches.filter((m) => (m.match_score || 0) >= 75).length;
    if (strong > 0) {
      notifs.push({
        id: "matches-strong",
        icon: "🎯",
        title: `${strong} strong compan${strong > 1 ? "ies" : "y"} match${strong > 1 ? "es" : ""} (75%+)`,
        time: "Based on your current profile",
      });
    }
  }

  if (currentProfile?.resume_filename) {
    notifs.push({
      id: "resume-analyzed",
      icon: "📄",
      title: `Resume "${currentProfile.resume_filename}" analyzed`,
      time: "Skills auto-detected and matches updated",
    });
  }

  if (completion < 100) {
    notifs.push({
      id: "profile-incomplete",
      icon: "📝",
      title: `Your profile is ${completion}% complete`,
      time: "Finish it in Profile to unlock better matches",
    });
  }

  const lowMatches = (allMatches || []).filter((m) => (m.match_score || 0) < 50 && (m.match_score || 0) > 0);
  if (lowMatches.length) {
    notifs.push({
      id: "skill-gaps",
      icon: "📈",
      title: `${lowMatches.length} match${lowMatches.length > 1 ? "es" : ""} held back by missing skills`,
      time: "Check your Skill Gap Roadmap",
    });
  }

  return notifs;
}

async function renderNotifications() {
  const list = document.getElementById("notifList");
  const badge = document.getElementById("notifBadge");
  if (!list || !badge) return;

  const dismissed = new Set(JSON.parse(localStorage.getItem(NOTIF_DISMISS_KEY) || "[]"));
  const local = buildNotifications().filter((n) => !dismissed.has(n.id));
  const dbNotifs = await loadDbNotifications();
  const visible = [...dbNotifs, ...local];
  const unreadCount = dbNotifs.filter((n) => !n.is_read).length + local.length;

  if (!visible.length) {
    list.innerHTML = '<div class="notif-empty">You\'re all caught up.</div>';
    badge.hidden = true;
  } else {
    list.innerHTML = visible.map((n) => `
      <div class="notif-item ${n.fromDb && !n.is_read ? "unread" : ""}" data-view="${n.link_view || ""}" data-id="${n.id}" data-fromdb="${!!n.fromDb}">
        <span class="notif-icon">${n.icon}</span>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-time">${n.time}</div>
        </div>
      </div>`).join("");
    badge.hidden = unreadCount === 0;
    badge.textContent = unreadCount > 9 ? "9+" : unreadCount;

    list.querySelectorAll(".notif-item").forEach((item) => item.addEventListener("click", async () => {
      const view = item.dataset.view;
      if (item.dataset.fromdb === "true" && supabase) {
        await supabase.from("notifications").update({ is_read: true }).eq("id", item.dataset.id);
      }
      document.getElementById("notifPanel").hidden = true;
      if (view) switchView(view);
      renderNotifications();
    }));
  }
}

/* =========================================================
   JOBS — company creates jobs, students see & apply to them
   ========================================================= */
let allJobs = [];

function initJobs() {
  const createBtn = document.getElementById("createJobBtn");
  const form = document.getElementById("createJobForm");
  const cancelBtn = document.getElementById("cancelJobBtn");
  const skillsInput = document.getElementById("jobSkills");
  const neededInput = document.getElementById("jobEmployeesNeeded");
  const haveInput = document.getElementById("jobEmployeesHave");
  if (createBtn) createBtn.addEventListener("click", () => {
    form.style.display = "block";
    createBtn.style.display = "none";
    form.scrollIntoView({ behavior: "smooth" });
  });
  if (cancelBtn) cancelBtn.addEventListener("click", () => {
    form.reset();
    form.style.display = "none";
    createBtn.style.display = "";
    updateJobTrackerPreview();
    renderJobSkillTags();
  });
  if (form) form.addEventListener("submit", saveJob);
  if (skillsInput) skillsInput.addEventListener("input", renderJobSkillTags);
  if (neededInput) neededInput.addEventListener("input", updateJobTrackerPreview);
  if (haveInput) haveInput.addEventListener("input", updateJobTrackerPreview);
}

function renderJobSkillTags() {
  const el = document.getElementById("jobSkillTags");
  if (!el) return;
  const skills = (document.getElementById("jobSkills")?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
  el.innerHTML = skills.map((s) => `<span class="skill-tag">${s}</span>`).join("");
}

function updateJobTrackerPreview() {
  const needed = parseInt(document.getElementById("jobEmployeesNeeded")?.value) || 0;
  const have = parseInt(document.getElementById("jobEmployeesHave")?.value) || 0;
  const pct = needed > 0 ? Math.min(100, Math.round((have / needed) * 100)) : 0;
  const fill = document.getElementById("jobTrackerFill");
  const label = document.getElementById("jobTrackerLabel");
  if (fill) fill.style.setProperty("--w", pct + "%");
  if (label) label.textContent = `${have} / ${needed} positions filled`;
}

async function loadJobs() {
  if (!supabase || !currentUser) return;
  const { data } = await supabase.from("jobs").select("*").eq("company_id", currentUser.id).order("created_at", { ascending: false });
  allJobs = data || [];
  renderJobsList();
}

function renderJobsList() {
  const container = document.getElementById("jobsListContainer");
  if (!container) return;
  if (!allJobs.length) {
    container.innerHTML = '<p class="muted">No jobs created. Click "Create a Job" to add your first job posting.</p>';
    return;
  }
  container.innerHTML = allJobs.map((j) => {
    const pct = j.employees_needed > 0 ? Math.min(100, Math.round((j.employees_have / j.employees_needed) * 100)) : 0;
    return `
    <div class="job-card">
      <div class="job-card-head">
        <div>
          <h3>${j.job_name || "Untitled Job"}</h3>
          <div class="job-card-role">${j.role || "—"}</div>
        </div>
        <span class="app-status ${j.status === "open" ? "shortlisted" : "rejected"}">${j.status}</span>
      </div>
      ${j.description ? `<div class="job-card-desc">${j.description}</div>` : ""}
      <div class="job-card-meta">
        <span><strong>₹${j.package_lpa || "—"} LPA</strong></span>
        <span>Needed: <strong>${j.employees_needed}</strong></span>
        <span>Hired: <strong>${j.employees_have}</strong></span>
      </div>
      ${(j.skills_required || []).length ? `<div class="job-card-skills">${j.skills_required.map((s) => `<span class="skill-tag">${s}</span>`).join("")}</div>` : ""}
      <div class="tracker-bar-wrap" style="margin-bottom:0.75rem">
        <div class="tracker-bar"><span style="--w:${pct}%"></span></div>
        <span class="muted">${j.employees_have} / ${j.employees_needed} positions filled</span>
      </div>
      <div class="job-actions">
        <button class="btn-ghost btn-sm" data-edit-job="${j.id}">Edit</button>
        <button class="btn-ghost btn-sm" data-delete-job="${j.id}">Delete</button>
      </div>
    </div>`;
  }).join("");
  container.querySelectorAll("[data-edit-job]").forEach((b) => b.addEventListener("click", () => editJob(b.dataset.editJob)));
  container.querySelectorAll("[data-delete-job]").forEach((b) => b.addEventListener("click", () => deleteJob(b.dataset.deleteJob)));
}

async function saveJob(e) {
  e.preventDefault();
  if (!supabase || !currentUser) return;
  const skills = (document.getElementById("jobSkills").value || "").split(",").map((s) => s.trim()).filter(Boolean);
  const payload = {
    company_id: currentUser.id,
    job_name: document.getElementById("jobName").value.trim(),
    role: document.getElementById("jobRole").value.trim(),
    description: document.getElementById("jobDescription").value.trim(),
    skills_required: skills,
    package_lpa: parseFloat(document.getElementById("jobPackage").value) || 0,
    employees_needed: parseInt(document.getElementById("jobEmployeesNeeded").value) || 0,
    employees_have: parseInt(document.getElementById("jobEmployeesHave").value) || 0,
    updated_at: new Date().toISOString(),
  };
  const editingId = document.getElementById("createJobForm").dataset.editingId;
  let error;
  if (editingId) {
    ({ error } = await supabase.from("jobs").update(payload).eq("id", editingId));
    delete document.getElementById("createJobForm").dataset.editingId;
  } else {
    ({ error } = await supabase.from("jobs").insert(payload));
  }
  if (error) { showToast("Couldn't save job: " + error.message, "error"); return; }
  document.getElementById("createJobForm").reset();
  document.getElementById("createJobForm").style.display = "none";
  document.getElementById("createJobBtn").style.display = "";
  showToast("Job created successfully!", "success");
  await loadJobs();
}

async function editJob(jobId) {
  const j = allJobs.find((x) => x.id === jobId);
  if (!j) return;
  const form = document.getElementById("createJobForm");
  form.style.display = "block";
  document.getElementById("createJobBtn").style.display = "none";
  form.dataset.editingId = jobId;
  document.getElementById("jobName").value = j.job_name || "";
  document.getElementById("jobRole").value = j.role || "";
  document.getElementById("jobDescription").value = j.description || "";
  document.getElementById("jobSkills").value = (j.skills_required || []).join(", ");
  document.getElementById("jobPackage").value = j.package_lpa || "";
  document.getElementById("jobEmployeesNeeded").value = j.employees_needed || "";
  document.getElementById("jobEmployeesHave").value = j.employees_have || "";
  renderJobSkillTags();
  updateJobTrackerPreview();
  form.scrollIntoView({ behavior: "smooth" });
}

async function deleteJob(jobId) {
  if (!confirm("Delete this job posting? This cannot be undone.")) return;
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) { showToast("Couldn't delete job: " + error.message, "error"); return; }
  showToast("Job deleted", "success");
  await loadJobs();
}

async function loadPublicJobs(companyId) {
  const el = document.getElementById("pubJobsList");
  if (!el || !companyId) return;
  const { data } = await supabase.from("jobs").select("*").eq("company_id", companyId).eq("status", "open").order("created_at", { ascending: false });
  const jobs = data || [];
  if (!jobs.length) {
    el.innerHTML = '<p class="muted">No jobs posted yet.</p>';
    return;
  }
  el.innerHTML = jobs.map((j) => `
    <div class="job-card">
      <div class="job-card-head">
        <div>
          <h3>${j.job_name || "Untitled Job"}</h3>
          <div class="job-card-role">${j.role || "—"}</div>
        </div>
        <span class="app-status shortlisted">₹${j.package_lpa || "—"} LPA</span>
      </div>
      ${j.description ? `<div class="job-card-desc">${j.description}</div>` : ""}
      ${(j.skills_required || []).length ? `<div class="job-card-skills">${j.skills_required.map((s) => `<span class="skill-tag">${s}</span>`).join("")}</div>` : ""}
      <div class="job-card-meta">
        <span>Positions: <strong>${j.employees_needed}</strong></span>
        <span>Hired: <strong>${j.employees_have}</strong></span>
      </div>
      <div class="job-actions">
        <button class="btn-primary btn-sm" data-apply-job="${j.id}">Apply Now</button>
      </div>
    </div>`).join("");
  el.querySelectorAll("[data-apply-job]").forEach((b) => b.addEventListener("click", () => {
    const job = jobs.find((x) => x.id === b.dataset.applyJob);
    if (currentPublicCompany && job) openApplyModal(currentPublicCompany, job);
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.body.classList.contains("login-page")) {
    initAuthPage();
  } else if (document.body.classList.contains("dashboard")) {
    initDashboard();
  }
});
