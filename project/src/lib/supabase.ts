import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase env vars missing. Check .env for VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Supabase fires a one-time 'PASSWORD_RECOVERY' auth event as soon as it parses
// the recovery tokens out of the URL, which can happen before React has even
// mounted the AuthProvider. We subscribe here, at module load, so the event is
// never missed, and expose a tiny pub-sub so React can pick it up whenever it's
// ready to listen.
export const authEvents = new EventTarget();
let recoveryPending = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryPending = true;
    authEvents.dispatchEvent(new Event('password-recovery'));
  }
});

export function isPasswordRecoveryPending() {
  return recoveryPending;
}

export function clearPasswordRecoveryPending() {
  recoveryPending = false;
}

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: 'student' | 'company' | 'admin' | 'owner';
  cgpa: number;
  branch: string;
  skills: string[];
  resume_text: string;
  resume_filename: string;
  profile_completion: number;
  created_at: string;
  avatar_url: string;
  banner_url: string;
  bio: string;
  is_banned: boolean;
  ban_reason: string;
  banned_at: string | null;
  banned_by: string | null;
};

export type AuditLogEntry = {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  target_label: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type Company = {
  id: string;
  name: string;
  role: string;
  package_lpa: number;
  required_skills: string[];
  min_cgpa: number;
  required_branches: string[];
  openings: number;
  logo_color: string;
  tier: string;
  created_at: string;
};

export type Match = {
  id: string;
  student_id: string;
  company_id: string;
  match_score: number;
  missing_skills: string[];
  matched_skills: string[];
  eligible: boolean;
  reasoning: string;
  status: string;
  created_at: string;
  companies?: Company;
};

export type Application = {
  id: string;
  student_id: string;
  company_id: string;
  status: string;
  applied_at: string;
  companies?: Company;
};

export type CompanyProfile = {
  id: string;
  org_name: string;
  industry: string;
  about_us: string;
  skills_required: string[];
  employees_needed: number;
  employees_have: number;
  address: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  avatar_url: string;
  banner_url: string;
  is_bot: boolean;
  updated_at: string;
  created_at: string;
};

export type CompanyApplication = {
  id: string;
  company_id: string;
  student_id: string;
  full_name: string;
  address: string;
  phone: string;
  email: string;
  resume_url: string;
  resume_filename: string;
  comment: string;
  status: 'submitted' | 'pending' | 'viewed' | 'shortlisted' | 'rejected' | 'hired';
  job_id: string | null;
  created_at: string;
};

export type Job = {
  id: string;
  company_id: string;
  job_name: string;
  role: string;
  description: string;
  skills_required: string[];
  package_lpa: number;
  employees_needed: number;
  employees_have: number;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link_view: string;
  link_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type Conversation = {
  id: string;
  user_a: string;
  user_b: string;
  last_message: string;
  last_message_at: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_url: string;
  attachment_name: string;
  attachment_type: string;
  created_at: string;
  read_at: string | null;
};

export type Friend = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
};

export type Call = {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'friend' | 'interview';
  room_name: string;
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
  created_at: string;
  updated_at: string;
};

export type SearchResult = {
  id: string;
  full_name: string;
  avatar_url: string;
  branch: string;
};

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

export type EventRegistration = {
  id: string;
  event_id: string;
  student_id: string;
  registered_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  author_id: string;
  author_name: string;
  author_role: string;
  priority: string;
  created_at: string;
};

export type StudentProject = {
  id: string;
  student_id: string;
  title: string;
  description: string;
  tech_stack: string[];
  project_url: string;
  image_url: string;
  created_at: string;
};

export type Bookmark = {
  id: string;
  student_id: string;
  company_id: string;
  created_at: string;
};

export type ForumPost = {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  title: string;
  body: string;
  category: string;
  views: number;
  created_at: string;
};

export type ForumReply = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
};

export type LeaderboardEntry = {
  student_id: string;
  full_name: string;
  avatar_url: string;
  branch: string;
  cgpa: number;
  skills_count: number;
  profile_completion: number;
  high_matches: number;
  total_matches: number;
  rank: number;
};
