// ============================================================================
// src/components/CompanyProfileCardModal.tsx
//
// WHAT THIS FILE IS: a "popup card" (a modal) that shows a quick preview
// of a company's profile — logo, banner, description, skills, contact
// info — used wherever the app wants to let someone glance at a company
// without fully navigating away to a dedicated page. A "modal" is any
// popup window that sits on top of the rest of the page and dims/blocks
// everything behind it until closed.
// ============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Building2, MapPin, Globe, Mail, Phone } from 'lucide-react';
import type { CompanyProfile } from '@/lib/supabase';

// The only thing the caller has to provide: which company to show
// (`companyId`), and what to do when the user closes it (`onClose`) — this
// component fetches everything else itself.
type Props = {
  companyId: string;
  onClose: () => void;
};

export function CompanyProfileCardModal({ companyId, onClose }: Props) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch the company's full profile the moment this modal opens (or if
  // `companyId` ever changes while it's open, though that's rare in practice).
  useEffect(() => {
    // `active` guards against a subtle bug: if this modal is closed (and
    // removed from the page) WHILE the network request is still in
    // flight, we don't want the request's result to try updating state on
    // a component that's already gone.
    let active = true;
    setLoading(true);
    setError(false);
    supabase
      .from('company_profiles')
      .select('*')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err || !data) {
          console.error('Failed to load company profile:', err);
          setError(true);
        } else {
          setCompany(data as CompanyProfile);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [companyId]);

  return (
    // The dim, semi-transparent full-screen backdrop. Clicking anywhere
    // on it (`onClick={onClose}`) closes the modal — a very common modal
    // UX pattern ("click outside to dismiss").
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md max-h-[90vh] overflow-y-auto scroll-thin animate-fade-in-scale"
        // `e.stopPropagation()` stops a click INSIDE the actual card from
        // "bubbling up" to the backdrop's onClick above — without this,
        // clicking anywhere inside the card (even just to read it) would
        // accidentally close the whole modal.
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          // While the data is still loading, show gray placeholder
          // "skeleton" shapes roughly matching where the real content will
          // appear — a common way to make loading feel faster/smoother
          // than a blank screen or a spinner.
          <div className="space-y-3 p-6">
            <div className="skeleton h-24 w-full rounded-xl" />
            <div className="skeleton mx-auto h-4 w-1/2" />
            <div className="skeleton h-16" />
          </div>
        ) : error || !company ? (
          // Fetching failed, or somehow no company matched this ID.
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
            <p className="text-sm text-[var(--text-muted)]">Couldn't load this company's profile.</p>
          </div>
        ) : (
          // Success — show the full company card.
          <>
            {/* Banner image (or a gradient placeholder if none is set),
                with the close (X) button floating on top of it. Height
                matches the profile edit page (h-32) and the student card
                modal for consistency — a shorter box here was cropping
                wide banner images much more than what people saw while
                uploading them. */}
            <div className="relative h-32 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-[var(--accent)]/25 to-[var(--accent-2)]/25">
              {company.banner_url ? (
                <img src={company.banner_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--accent),transparent_60%)] opacity-40" />
              )}
              <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-white hover:bg-black/50">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 pt-0">
              {/* The logo overlaps the bottom of the banner (`-mt-10`
                  pulls it up), a common profile-card visual style. Falls
                  back to a generic building icon if no logo was uploaded. */}
              <div className="-mt-10 mb-3 flex items-end gap-3">
                {company.avatar_url ? (
                  <img src={company.avatar_url} alt="" className="h-16 w-16 rounded-2xl border-2 border-[var(--bg-elevated)] object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--bg-elevated)] bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white">
                    <Building2 size={24} />
                  </div>
                )}
              </div>
              <p className="text-lg font-semibold">{company.org_name || 'Company'}</p>
              {company.industry && <p className="text-xs text-[var(--text-muted)]">{company.industry}</p>}

              {/* Every section below only renders if that piece of data
                  actually exists — a company that hasn't filled in, say,
                  a phone number, just won't show that row at all, rather
                  than showing an empty/blank line. */}
              {company.about_us && (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">{company.about_us}</p>
              )}

              {company.skills_required && company.skills_required.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">Skills they look for</p>
                  <div className="flex flex-wrap gap-1.5">
                    {company.skills_required.map((s) => (
                      <span key={s} className="rounded-md bg-[var(--accent)]/10 px-2 py-1 text-xs text-[var(--accent)]">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact details, each with a small matching icon. */}
              <div className="mt-4 space-y-1.5 text-xs text-[var(--text-muted)]">
                {company.address && <p className="flex items-center gap-1.5"><MapPin size={12} /> {company.address}</p>}
                {company.website && <p className="flex items-center gap-1.5"><Globe size={12} /> {company.website}</p>}
                {company.contact_email && <p className="flex items-center gap-1.5"><Mail size={12} /> {company.contact_email}</p>}
                {company.contact_phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {company.contact_phone}</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
