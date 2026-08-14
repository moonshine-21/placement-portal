// ============================================================================
// src/lib/supabase.ts
//
// WHAT THIS FILE IS:
// This is the single "connection wire" between our website (the React app
// running in the browser) and our database (Supabase, which is a hosted
// Postgres database plus a login system plus file storage, all in one).
// Every other file in this project that needs to read or write data
// imports `supabase` FROM THIS FILE — there is only ever one connection,
// shared everywhere, so we don't accidentally create ten different
// connections that don't agree with each other.
//
// This file also defines the "shape" of every kind of data our app works
// with (a Profile, a Job, a Message, and so on) using TypeScript "types".
// Think of a type as a label on a box that says exactly what's allowed to
// go inside it — e.g. the Profile type says "a Profile always has a name
// (text), a cgpa (a number), and a list of skills (a list of text)." If
// any other file in the project tries to put the wrong kind of thing in
// one of these boxes, the code editor complains immediately, before we
// ever run the app — this catches a huge number of bugs before they
// happen, for free.
// ============================================================================

// `createClient` is a function supplied by Supabase's own code library.
// Calling it gives us back an object we can use to talk to our database.
import { createClient } from '@supabase/supabase-js';

// These two values are like a website address + a password, but for our
// database instead of a website. They're not typed directly into this
// file — they live in a separate ".env" file that never gets uploaded to
// GitHub, so our database credentials don't end up public on the internet.
// `import.meta.env` is how Vite (the tool that builds this website) lets
// our code read values out of that .env file.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A safety check: if someone forgot to set up the .env file, the app
// would fail in confusing ways later on. This prints a clear error to the
// browser's console immediately instead, so whoever's debugging knows
// exactly what's wrong right away.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env vars missing. Check .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

// This is the actual connection object. Every file that does
// `import { supabase } from './lib/supabase'` gets this exact same
// connection — reused, not recreated each time.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,     // stay logged in even after closing/reopening the browser tab
    autoRefreshToken: true,   // automatically renew the login session before it expires, so people don't get randomly logged out
    detectSessionInUrl: true, // needed for things like "reset your password" links, which carry login info in the URL itself
  },
});

// ----------------------------------------------------------------------------
// Password-reset event plumbing
// ----------------------------------------------------------------------------
// When someone clicks a "reset your password" link in their email, Supabase
// fires a one-time signal called 'PASSWORD_RECOVERY' the moment it notices
// the special reset code in the page's URL. The tricky part: this can
// happen extremely early — possibly before React has even finished setting
// up the rest of the app — so if we waited to start listening until some
// React component mounted, we could miss the signal entirely. Instead, we
// start listening RIGHT HERE, the instant this file is first loaded, and
// remember whether it happened using a simple on/off flag. Any part of the
// app can check that flag later, whenever it's ready.

// `EventTarget` is a built-in browser tool for "announcing" that something
// happened, so other parts of the code can listen for it.
export const authEvents = new EventTarget();

// A simple true/false flag: "has a password-recovery link been detected
// that nobody has handled yet?"
let recoveryPending = false;

// Subscribe to every auth event Supabase fires. We only care about one
// specific kind: 'PASSWORD_RECOVERY'.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryPending = true;
    // Broadcast a "password-recovery" announcement so any listening code
    // (see src/pages/ResetPasswordPage.tsx) can react to it right away.
    authEvents.dispatchEvent(new Event('password-recovery'));
  }
});

// A little "getter" function — lets other files check the flag without
// being able to directly poke at (and accidentally break) the variable
// itself.
export function isPasswordRecoveryPending() {
  return recoveryPending;
}

// Called once the reset-password screen has actually been shown, so we
// don't keep re-triggering it.
export function clearPasswordRecoveryPending() {
  recoveryPending = false;
}

// ----------------------------------------------------------------------------
// DATA TYPES
// ----------------------------------------------------------------------------
// Everything below this line is just describing the SHAPE of each kind of
// data in our database — it doesn't run any code. Each `type X = { ... }`
// block matches one table in the database (see supabase/setup.sql), field
// for field. If a column is added/removed/renamed in the database, this
// type should be updated to match, or TypeScript will (correctly) start
// complaining that the code doesn't line up with reality anymore.

// A Profile = one person's account. Every signed-up user (student,
// company, admin, or owner) has exactly one Profile row.
export type Profile = {
  id: string;                                          // unique ID, matches their login account's ID
  full_name: string;                                   // their display name
  email: string;
  role: 'student' | 'company' | 'admin' | 'owner';      // what kind of account this is — controls what they're allowed to see/do
  cgpa: number;                                         // (students) their grade average
  branch: string;                                       // (students) their field of study, e.g. "Computer Science"
  skills: string[];                                     // a list of skill names, e.g. ["Python", "React"]
  resume_text: string;                                  // plain text extracted from their uploaded resume, used for AI matching/search
  resume_filename: string;                              // the original filename of their uploaded resume
  profile_completion: number;                           // a 0-100 percentage of how "filled in" their profile is
  created_at: string;                                   // when this account was created (as a date/time text)
  avatar_url: string;                                   // link to their profile picture
  banner_url: string;                                   // link to their profile page's banner/cover image
  bio: string;                                          // a short "about me" paragraph
  is_banned: boolean;                                   // true if an admin has banned this account
  ban_reason: string;                                   // why, if banned
  banned_at: string | null;                             // when, if banned (null means "not banned")
  banned_by: string | null;                             // which admin banned them, if banned
};

// One row in the admin audit trail — a permanent record of "who did what,"
// so admin actions (banning someone, deleting a post, etc.) can be
// reviewed later.
export type AuditLogEntry = {
  id: string;
  actor_id: string;                    // the admin who did the action
  actor_name: string;
  action: string;                      // e.g. "ban_user", "delete_post"
  target_type: string;                 // what kind of thing was affected, e.g. "profile", "forum_post"
  target_id: string;                   // the ID of that specific thing
  target_label: string;                // a human-readable name for it, for display
  details: Record<string, unknown>;    // any extra info about the action, stored as flexible JSON
  created_at: string;
};

// A Company, in the OLDER/separate sense used by the "Matches" feature —
// not the same thing as CompanyProfile below (which is a real company's
// own account/page). This is more like a static list of hypothetical
// employers the matching algorithm compares student profiles against.
export type Company = {
  id: string;
  name: string;
  role: string;                     // the job role/title this entry represents
  package_lpa: number;              // salary, in "lakhs per annum" (a common Indian salary unit)
  required_skills: string[];
  min_cgpa: number;                 // minimum grade average required to be considered eligible
  required_branches: string[];      // which fields of study are eligible
  openings: number;                 // how many positions are open
  logo_color: string;               // a color used to generate a simple logo when there's no real logo image
  tier: string;                     // e.g. "top", "mid" — used to group/sort companies by prestige
  created_at: string;
};

// A calculated "how good a fit is this student for this Company" result —
// generated by an AI matching pass, not typed in by a person.
export type Match = {
  id: string;
  student_id: string;
  company_id: string;
  match_score: number;              // 0-100, how strong a fit this is
  missing_skills: string[];         // skills the company wants that this student doesn't have listed
  matched_skills: string[];         // skills that DO line up
  eligible: boolean;                // does the student meet the hard requirements (CGPA, branch)?
  reasoning: string;                // a short AI-written explanation of the score
  status: string;
  created_at: string;
  companies?: Company;              // (optional) the full Company details, when this Match was fetched joined together with it
};

// A student's application to one of the OLDER-style `Company` entries
// above (separate system from the real company_applications/jobs
// system used by real & bot company accounts, below).
export type Application = {
  id: string;
  student_id: string;
  company_id: string;
  status: string;
  applied_at: string;
  companies?: Company;
};

// A real Company's own account page — this is what a signed-up company
// (human-run or AI-run/"bot") fills out and shows to students.
export type CompanyProfile = {
  id: string;                       // same as the company's login-account ID
  org_name: string;                 // the company's display name
  industry: string;
  about_us: string;                 // a description paragraph
  skills_required: string[];        // skills this company generally looks for
  employees_needed: number;         // how many people they're trying to hire overall
  employees_have: number;           // how many they've already hired through the site
  address: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  avatar_url: string;               // company logo
  banner_url: string;               // company page banner image
  is_bot: boolean;                  // true if this company account is run by AI rather than a real person (see api/bot-*.ts)
  updated_at: string;
  created_at: string;
};

// A student's application to a specific job posting from a real
// CompanyProfile (this is the modern application system — separate from
// the older `Application`/`Company` pair above).
export type CompanyApplication = {
  id: string;
  company_id: string;
  student_id: string;
  full_name: string;                // captured at time of applying (in case the student's profile name changes later)
  address: string;
  phone: string;
  email: string;
  resume_url: string;               // link to the resume file they submitted with this specific application
  resume_filename: string;
  comment: string;                  // an optional note the student wrote to the company
  // The application's progress through the hiring pipeline:
  status: 'submitted' | 'pending' | 'viewed' | 'shortlisted' | 'rejected' | 'hired';
  job_id: string | null;            // which specific job posting this application is for (can be null for a general application)
  created_at: string;
};

// One job posting made by a company.
export type Job = {
  id: string;
  company_id: string;
  job_name: string;                 // the job title, e.g. "Backend Engineer"
  role: string;                     // a one-line summary of the role
  description: string;
  skills_required: string[];
  package_lpa: number;              // salary offered
  employees_needed: number;         // how many people this specific posting is hiring for
  employees_have: number;           // how many have been hired for it so far
  status: 'open' | 'closed';        // whether students can currently apply
  created_at: string;
  updated_at: string;
};

// An in-app alert shown to one specific user (a little red-dot bell
// notification), e.g. "your application status changed."
export type Notification = {
  id: string;
  user_id: string;                  // who should see this notification
  type: string;                     // a category, e.g. "message", "status" — used to pick an icon/behavior
  title: string;
  body: string;
  link_view: string;                // which page/tab clicking this notification should jump to
  link_id: string | null;           // an ID (e.g. which conversation) needed to jump to the exact right spot
  is_read: boolean;
  created_at: string;
};

// A single DM (direct message) thread between exactly two people
// (student-to-student, or student-to-company).
export type Conversation = {
  id: string;
  user_a: string;                   // one participant's ID
  user_b: string;                   // the other participant's ID
  last_message: string;             // a short preview of the most recent message, shown in the conversation list
  last_message_at: string;
  created_at: string;
};

// One message inside a Conversation.
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;                // who sent it
  body: string;                     // the text content
  attachment_url: string;           // link to a file/image attached to this message (empty string if none)
  attachment_name: string;
  attachment_type: string;          // e.g. 'image', 'quiz' — tells the chat UI how to render the attachment
  created_at: string;
  read_at: string | null;           // when the recipient read it (null if still unread)
};

// A friend connection between two students (a request that's pending,
// accepted, or declined).
export type Friend = {
  id: string;
  requester_id: string;             // who sent the friend request
  recipient_id: string;             // who received it
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
};

// A video/voice call record — either a casual call between friends, or a
// company conducting a live interview with a student.
export type Call = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'friend' | 'interview';
  room_name: string;                 // the unique name of the video-call "room" both sides join
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  created_at: string;
  updated_at: string;
};

// A trimmed-down version of Profile, used in search results where we
// don't need every field — just enough to show a name and picture in a
// list.
export type SearchResult = {
  id: string;
  full_name: string;
  avatar_url: string;
  branch: string;
};

// A campus event (workshop, hackathon, career fair, etc.) that students
// can view and register for.
export type Event = {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_type: string;
  location: string;
  organizer_id: string;
  organizer_name: string;
  created_at: string;
};

// A record of one student signing up to attend one Event.
export type EventRegistration = {
  id: string;
  event_id: string;
  student_id: string;
  registered_at: string;
};

// A campus-wide announcement (like a bulletin board post), postable by
// admins/owners/companies.
export type Announcement = {
  id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  author_role: string;
  priority: string;                 // e.g. "normal", "urgent" — affects how it's styled/sorted
  created_at: string;
};

// A personal project a student has added to their profile, to showcase
// their work (like a mini portfolio entry).
export type StudentProject = {
  id: string;
  student_id: string;
  title: string;
  description: string;
  tech_stack: string[];             // technologies used, e.g. ["React", "Node.js"]
  project_url: string;              // link to the live project or its code repository
  image_url: string;                // a preview screenshot
  created_at: string;
};

// A student "saving" a Company for later (like a bookmark/favorite).
export type Bookmark = {
  id: string;
  student_id: string;
  company_id: string;
  created_at: string;
};

// One discussion-forum post (like a mini Reddit thread starter).
export type ForumPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  title: string;
  body: string;
  category: string;
  views: number;                    // how many times this post has been opened
  created_at: string;
};

// One reply to a ForumPost.
export type ForumReply = {
  id: string;
  post_id: string;                  // which ForumPost this reply belongs to
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
};

// One row of the public leaderboard — a student's ranking based on
// profile strength and match performance.
export type LeaderboardEntry = {
  student_id: string;
  full_name: string;
  avatar_url: string;
  branch: string;
  cgpa: number;
  skills_count: number;             // how many skills they've listed
  profile_completion: number;
  high_matches: number;             // how many strong (high match_score) Matches they have
  total_matches: number;
  rank: number;                     // their position on the leaderboard (1st, 2nd, 3rd, ...)
};
