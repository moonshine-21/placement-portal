// ============================================================================
// src/views/JobsView.tsx
//
// WHAT THIS FILE IS: the company-side page for managing job postings —
// create, edit, and delete jobs, with a visual progress bar showing how
// many of the needed positions have been filled so far.
//
// Note: this is the SAME `jobs` table that the AI "bot" companies write
// to automatically (see api/bot-rotate-jobs.ts) — a real human company
// managing jobs through this page, and a bot company having jobs
// generated for it by Gemini, both just produce ordinary rows in the same
// table. This page has no special awareness of bots at all.
// ============================================================================

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { Plus, X, Save, Trash2, Briefcase, Edit3 } from 'lucide-react';
import type { Job } from '@/lib/supabase';

export function JobsView() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showForm, setShowForm] = useState(false);
  // Which job is currently being edited, if any — `null` means the form
  // (if open) is for creating a BRAND NEW job instead of editing an
  // existing one. This single value is what the form's submit handler
  // checks to decide between INSERT and UPDATE (see handleSubmit below).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // One piece of state per form field — all kept as plain text/strings
  // even for numeric fields (package, employee counts), and converted to
  // real numbers only at save time (see handleSubmit) — this is simpler
  // than juggling number-typed state while someone's still mid-typing
  // (e.g. an empty or partial number field is awkward to represent as an
  // actual `number` type).
  const [jobName, setJobName] = useState('');
  const [jobRole, setJobRole] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [jobSkills, setJobSkills] = useState('');
  const [jobPackage, setJobPackage] = useState('');
  const [empNeeded, setEmpNeeded] = useState('');
  const [empHave, setEmpHave] = useState('');
  const [saving, setSaving] = useState(false);

  const loadJobs = async () => {
    if (!profile) return;
    const { data } = await supabase.from('jobs').select('*').eq('company_id', profile.id).order('created_at', { ascending: false });
    setJobs((data as Job[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadJobs(); }, [profile?.id]);

  // Clears every form field back to blank and closes the form — used both
  // after a successful save AND when the "Cancel"/X button is clicked.
  const resetForm = () => {
    setJobName(''); setJobRole(''); setJobDesc(''); setJobSkills(''); setJobPackage(''); setEmpNeeded(''); setEmpHave('');
    setEditingId(null); setShowForm(false);
  };

  // Pre-fills the form with an EXISTING job's data, and marks it as being
  // edited (rather than a new job) via `editingId`.
  const editJob = (j: Job) => {
    setJobName(j.job_name); setJobRole(j.role); setJobDesc(j.description);
    setJobSkills(j.skills_required.join(', ')); setJobPackage(String(j.package_lpa));
    setEmpNeeded(String(j.employees_needed)); setEmpHave(String(j.employees_have));
    setEditingId(j.id); setShowForm(true);
  };

  // Handles BOTH creating a new job and saving edits to an existing one —
  // which branch runs depends on whether `editingId` is set.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    // Build one shared payload object used for either the insert or
    // update below, converting the text-based number fields back into
    // real numbers here (with `|| 0` as a fallback if parsing fails,
    // e.g. from an empty field).
    const payload = {
      company_id: profile.id, job_name: jobName, role: jobRole, description: jobDesc,
      skills_required: jobSkills.split(',').map((s) => s.trim()).filter(Boolean),
      package_lpa: parseFloat(jobPackage) || 0, employees_needed: parseInt(empNeeded) || 0,
      employees_have: parseInt(empHave) || 0, updated_at: new Date().toISOString(),
    };
    if (editingId) {
      const { error } = await supabase.from('jobs').update(payload).eq('id', editingId);
      if (error) { showToast('Could not save job: ' + error.message, 'error'); setSaving(false); return; }
      showToast('Job updated', 'success');
    } else {
      const { error } = await supabase.from('jobs').insert(payload);
      if (error) { showToast('Could not create job: ' + error.message, 'error'); setSaving(false); return; }
      showToast('Job created', 'success');
    }
    setSaving(false); resetForm(); loadJobs();
  };

  const deleteJob = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    await supabase.from('jobs').delete().eq('id', id);
    showToast('Job deleted', 'info');
    loadJobs();
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Jobs</h2>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary btn-sm"><Plus size={14} /> Create a Job</button>
        </div>
        {loading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-24" />)}</div>
        : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Briefcase size={28} className="text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No jobs created yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => {
              // How far along hiring is for this job, as a 0-100
              // percentage, for the progress bar below. Guards against
              // dividing by zero if `employees_needed` is 0.
              const progress = j.employees_needed > 0 ? Math.min(100, (j.employees_have / j.employees_needed) * 100) : 0;
              return (
                <div key={j.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 animate-fade-in">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{j.job_name}</h3>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${j.status === 'open' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{j.status}</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] mt-0.5">{j.role} · {j.package_lpa} LPA</p>
                      {j.description && <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{j.description}</p>}
                      {j.skills_required.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">{j.skills_required.map((s) => <span key={s} className="rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">{s}</span>)}</div>
                      )}
                      {/* Visual hiring-progress bar, filled proportionally
                          to `progress` computed above. */}
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-[var(--border-strong)] overflow-hidden max-w-32"><div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs text-[var(--text-muted)]">{j.employees_have}/{j.employees_needed} filled</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button onClick={() => editJob(j)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Edit3 size={14} /></button>
                      <button onClick={() => deleteJob(j.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The create/edit form — same form used for both, its heading and
          submit behavior just change based on `editingId`. */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-5 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editingId ? 'Edit Job' : 'Create a Job'}</h2>
            <button type="button" onClick={resetForm} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Job name</label><input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="e.g. Frontend Developer" required className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Job role</label><input value={jobRole} onChange={(e) => setJobRole(e.target.value)} placeholder="e.g. React Developer" className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Description</label><textarea value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} rows={3} placeholder="What the role involves…" className="input-field" /></div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Skills required (comma separated)</label><input value={jobSkills} onChange={(e) => setJobSkills(e.target.value)} placeholder="React, JavaScript, CSS" className="input-field" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Package (LPA)</label><input type="number" step="0.01" min="0" value={jobPackage} onChange={(e) => setJobPackage(e.target.value)} placeholder="12.00" className="input-field" /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Employees needed</label><input type="number" min="0" value={empNeeded} onChange={(e) => setEmpNeeded(e.target.value)} placeholder="5" className="input-field" /></div>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Employees hired so far</label><input type="number" min="0" value={empHave} onChange={(e) => setEmpHave(e.target.value)} placeholder="0" className="input-field" /></div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary"><Save size={16} /> {saving ? 'Saving…' : 'Save Job'}</button>
            <button type="button" onClick={resetForm} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
