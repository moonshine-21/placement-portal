import { supabase } from './supabase';

// Activates the current user's account as a Company account. There's no
// payment step at all — this just calls the server, which checks the
// caller is signed in and not already a company, then grants the role.
export async function activateCompanyAccount(): Promise<{ success: true } | { success: false; error: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { success: false, error: 'You must be signed in.' };

  try {
    const res = await fetch('/api/company-activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json.error || 'Could not activate.' };
    return { success: true };
  } catch {
    return { success: false, error: 'Could not reach the server.' };
  }
}
