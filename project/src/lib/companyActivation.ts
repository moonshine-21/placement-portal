// This file has exactly one job: turn the currently-signed-in student's
// account into a Company account, by asking the server to do it.
//
// Why does the browser need to "ask the server" instead of just doing it
// directly? Because the browser is never trusted to grant itself special
// permissions — anyone could open their browser's developer console and
// try to change their own role to "company" directly. So instead, the
// browser only ever sends a request ("please make me a company"), and a
// server-side function (api/company-activate.ts) — which the browser
// cannot tamper with — is the only thing allowed to actually flip that
// switch in the database.

// `supabase` is our shared connection to the Supabase backend (database +
// login system). We only use it here to read the current login session.
import { supabase } from './supabase';

// `activateCompanyAccount` is an "async function" — a function that does
// something that takes a little time (talking to the internet) and lets
// the rest of the page keep working while it waits.
//
// It returns one of two shapes:
//   { success: true }                      — it worked
//   { success: false, error: "some text" } — it didn't, and here's why
//
// Whatever code calls this function checks `.success` to know which one
// it got back, then either celebrates or shows the `.error` message.
export async function activateCompanyAccount(): Promise<{ success: true } | { success: false; error: string }> {
  // Step 1: Get the person's current login session from Supabase. A
  // "session" is proof that this browser is really logged in as a real
  // user — it contains a secret token (like a temporary ID card) that the
  // server can check.
  const { data: sessionData } = await supabase.auth.getSession();

  // Pull just the token string out of that session object. If the person
  // somehow isn't logged in, this will be `undefined`.
  const token = sessionData.session?.access_token;

  // If there's no token, we can't even ask the server — stop here and
  // report a clear error instead of sending a broken request.
  if (!token) return { success: false, error: 'You must be signed in.' };

  // Step 2: Send the actual request to our server. `try/catch` here means
  // "attempt this, and if anything goes wrong unexpectedly (like the
  // internet connection dropping), don't crash the app — just report a
  // friendly error instead."
  try {
    // `fetch` is the browser's built-in way of calling a URL. We're
    // calling our own server's `/api/company-activate` endpoint.
    const res = await fetch('/api/company-activate', {
      method: 'POST', // POST means "do something / change something", as opposed to GET which just reads data.
      headers: {
        'Content-Type': 'application/json', // tells the server "the data I'm sending is in JSON format"
        Authorization: `Bearer ${token}`,     // proves who's asking, using the login token from Step 1
      },
    });

    // The server always replies with some JSON (a small text object).
    // Turn that raw response into a real JavaScript object we can read.
    const json = await res.json();

    // `res.ok` is true only if the server responded with a success status
    // code (like 200). If it's false, something went wrong on the server
    // side — grab the error message it sent back, or use a generic one.
    if (!res.ok) return { success: false, error: json.error || 'Could not activate.' };

    // If we get here, everything worked — the server has already updated
    // the database to mark this account as a company account.
    return { success: true };
  } catch {
    // This only runs if `fetch` itself failed to even reach the server —
    // e.g. no internet connection. We didn't get any response to read, so
    // we just report a generic "couldn't reach the server" message.
    return { success: false, error: 'Could not reach the server.' };
  }
}
