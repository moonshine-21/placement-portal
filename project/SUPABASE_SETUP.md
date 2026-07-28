# Smart Placement Cell Portal — Setup Guide

## Project Structure
```
project/
├── frontend/
│   ├── dashboard.html      # Main dashboard (10 views)
│   ├── login.html          # Sign in / Sign up + Google OAuth
│   ├── css/style.css       # Glassmorphism + 3 themes
│   └── js/app.js           # Auth, charts, backend integration
├── backend/
│   └── app.py              # Flask API (upload, analyze, companies, matches)
├── requirements.txt        # Python dependencies
└── SUPABASE_SETUP.md       # This file
```

---

## Phase 1–2: Frontend (no setup needed)

The frontend is plain HTML/CSS/JS — open it directly in a browser or serve
with any static server.

```bash
# Option A: open the file directly
open frontend/login.html

# Option B: serve with Vite (already configured)
npm install
npm run dev
# visit http://localhost:5173/frontend/login.html
```

Three themes (Light / Dark / Glass Aurora) are switchable from the navbar
dropdown or Settings page. The choice is saved to `localStorage`.

---

## Phase 3: Flask Backend

```bash
cd backend
pip install -r ../requirements.txt
python app.py
# API runs on http://localhost:5000
```

### API Endpoints

| Method | Route        | Body / Params                         | Returns                              |
|--------|--------------|---------------------------------------|--------------------------------------|
| GET    | `/companies` | —                                     | Company catalog (7 recruiters)       |
| POST   | `/upload`    | `multipart/form-data` field `resume` | Extracted text, skills, CGPA, branch |
| POST   | `/analyze`   | PDF upload **or** JSON `{skills,cgpa,branch}` | Match scores + missing skills | 
| GET    | `/matches`   | Query: `skills=React,Python&cgpa=8.5&branch=CSE` | Sorted match list            |

**Note:** this Flask API is currently a standalone, optional service — `frontend/js/app.js`
does not call it. Resume parsing runs entirely in the browser (via `pdf.js`) and all data
(companies, matches, applications) is read from Supabase directly. Keep `backend/` if you
want its matching logic as a reference or want to wire it up yourself; it isn't required to
run or host the app.

---

## Phase 4: Supabase Setup

A Supabase project is already provisioned for this app. The connection
details live in `.env`:

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Database Schema

The schema is created automatically via migration. Four tables:

1. **profiles** — extends `auth.users` with `role` (student/admin), `cgpa`,
   `branch`, `skills[]`, `resume_text`, `profile_completion`.
2. **companies** — recruiter catalog (seeded with 7 sample companies).
3. **matches** — per-student × per-company match scores.
4. **applications** — tracks which companies a student has applied to.

All tables have Row-Level Security enabled:
- Students can only read/modify their own rows.
- Admins (role = 'admin') can read all profiles, matches, and applications.
- Companies are readable by all authenticated users; only admins can edit.

### Enable Google Sign-In

1. Open the Supabase dashboard → **Authentication → Providers**.
2. Enable **Google**.
3. Add your Google OAuth Client ID and Client Secret (from the Google Cloud
   Console — create a project, enable Google+ API, create OAuth credentials).
4. Add the Supabase callback URL to the Google Console authorized redirects:
   `https://<project-id>.supabase.co/auth/v1/callback`
5. The frontend's "Continue with Google" button now works out of the box.

### Promote an Admin

After signing up, promote a user to admin by running this in the Supabase
SQL editor:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your@email.com';
```

That user will then see the Analytics view populated with cohort data.

---

## Phase 5: How data actually flows

- On dashboard load: the browser queries Supabase directly for `companies`, `matches`, `applications`.
- On resume upload: `pdf.js` (loaded via CDN in `dashboard.html`) extracts real text from the
  PDF in-browser, then a keyword matcher detects skills/CGPA/branch and saves them to your
  Supabase `profiles` row.
- The AI chat assistant first tries the `/api/ai-chat` serverless function (real Claude
  responses grounded in your profile + matches). If that function isn't deployed or has no
  API key configured, it silently falls back to a deterministic rule-based reply — so the
  assistant always works, with or without the AI function.
- Sign up now collects **Full Name** and passes it to Supabase as `user_metadata.full_name`,
  which becomes the student's `profiles.full_name` on first login. Signing up with an email
  that's already registered is detected and shows "already exists — sign in instead" rather
  than silently creating a duplicate-looking account. The password field has a show/hide eye
  toggle.

---

## Running locally

```bash
npm install && npm run dev
```

Open the URL Vite prints and go to `/frontend/login.html`. (`backend/app.py` is optional —
see the note in Phase 3.) To test the `/api/ai-chat` function locally too, use the
[Vercel CLI](https://vercel.com/docs/cli): `vercel dev`.

---

## Hosting (Vercel)

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Vercel auto-detects Vite
   (build command `npm run build`, output `dist`) via `vercel.json`, and auto-detects
   the `/api` folder as serverless functions — no extra config needed.
3. Add environment variables under **Project → Settings → Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY` (only needed for the real AI chat — see below; free, no card required)
4. Deploy. Your site's root `index.html` redirects to `/frontend/login.html`.

Any static host that runs a Vite build works too — just add an equivalent serverless
function for `ai-chat` if you host elsewhere (Vercel's `/api` convention is Vercel-specific).

---

## Adding real AI (already wired up — just needs a key)

`api/ai-chat.js` calls Google's Gemini API server-side, so the key never reaches
the browser. It's free with no card required. To turn it on:

1. Get a free API key from [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   (sign in with a Google account, no billing setup needed).
2. In Vercel: **Project → Settings → Environment Variables** → add `GEMINI_API_KEY`.
3. Redeploy. The chat assistant will now answer with real, context-aware AI instead
   of the canned rule-based replies (which remain as the offline fallback).

To test locally: `vercel dev` runs the Vite app and the `/api` functions together,
reading env vars from a local `.env` (via `vercel env pull` or manually).
