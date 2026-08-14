import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Building2, MapPin, Globe, Mail, Phone } from 'lucide-react';
import type { CompanyProfile } from '@/lib/supabase';
import { Portal } from '@/components/Portal';

type Props = {
  companyId: string;
  onClose: () => void;
};

export function CompanyProfileCardModal({ companyId, onClose }: Props) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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
    <Portal>
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md max-h-[90vh] overflow-y-auto scroll-thin animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="space-y-3 p-6">
            <div className="skeleton h-24 w-full rounded-xl" />
            <div className="skeleton mx-auto h-4 w-1/2" />
            <div className="skeleton h-16" />
          </div>
        ) : error || !company ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
            <p className="text-sm text-[var(--text-muted)]">Couldn't load this company's profile.</p>
          </div>
        ) : (
          <>
            <div className="relative h-24 w-full overflow-hidden rounded-t-2xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20">
              {company.banner_url && <img src={company.banner_url} alt="" className="h-full w-full object-cover" />}
              <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-black/30 text-white hover:bg-black/50">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 pt-0">
              <div className="-mt-8 mb-3 flex items-end gap-3">
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
    </Portal>
  );
}
