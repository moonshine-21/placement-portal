// Vite replaces import.meta.env.VITE_* at build/serve time for .js files.
// This module exposes the Supabase credentials globally so the classic
// app.js script can read them without being a module itself.
window.__SUPABASE_URL__ = import.meta.env.VITE_SUPABASE_URL;
window.__SUPABASE_ANON_KEY__ = import.meta.env.VITE_SUPABASE_ANON_KEY;
