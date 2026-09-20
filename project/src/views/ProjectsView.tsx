// ============================================================================
// src/views/ProjectsView.tsx
//
// WHAT THIS FILE IS: a student's personal "mini portfolio" page — add,
// view, and delete showcase projects (title, description, tech stack,
// link, screenshot), shown here and also on their public ProfileCardModal
// so other people (and companies) can see their work.
// ============================================================================

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPublicFile, timeAgo } from '@/lib/data';
import { createPortal } from 'react-dom';
import { FolderGit2, Plus, X, Trash2, ExternalLink, Code2, Pencil, Eye } from 'lucide-react';
import type { StudentProject } from '@/lib/supabase';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export function ProjectsView() {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false); // is the "add new project" form currently expanded?
  // Form field state — one piece of state per input in the "add project" form.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [techStack, setTechStack] = useState(''); // typed as one comma-separated string, split into a real list on submit (see `create` below)
  const [projectUrl, setProjectUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null); // the raw selected file, kept just to show its filename in the UI
  const [imageUrl, setImageUrl] = useState('');                  // the URL it uploads to, once the upload finishes
  const [saving, setSaving] = useState(false);
  // When set, the form below is editing this existing project instead of creating a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  // When set, the read-only detail popup is showing this project.
  const [viewProject, setViewProject] = useState<StudentProject | null>(null);

  const resetForm = () => {
    setTitle(''); setDescription(''); setTechStack(''); setProjectUrl(''); setImageUrl(''); setImageFile(null);
    setEditingId(null);
  };

  const openNew = () => {
    if (showForm && !editingId) { setShowForm(false); return; }
    resetForm();
    setShowForm(true);
  };

  // Loads an existing project into the form so it can be edited.
  const startEdit = (p: StudentProject) => {
    setViewProject(null);
    setEditingId(p.id);
    setTitle(p.title || '');
    setDescription(p.description || '');
    setTechStack((p.tech_stack || []).join(', '));
    setProjectUrl(p.project_url || '');
    setImageUrl(p.image_url || '');
    setImageFile(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('student_projects').select('*').eq('student_id', user.id).order('created_at', { ascending: false });
    setProjects((data as StudentProject[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Runs the moment a screenshot file is picked — uploads it IMMEDIATELY
  // (rather than waiting for the whole form to be submitted), so by the
  // time the person clicks "Save Project" the image is already sitting in
  // storage with a real URL ready to attach.
  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImageFile(file);
    const url = await uploadPublicFile('banners', file, user.id);
    if (url) setImageUrl(url);
  };

  // Saves the project — inserts a new row, or updates the existing one when
  // `editingId` is set.
  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // Make links safe + clickable: add https:// if missing, and only allow http(s).
    let url = projectUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (url && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) { showToast('Please enter a valid project URL', 'error'); return; }
    setSaving(true);
    // Turn "React, Python, TensorFlow" into ["React", "Python", "TensorFlow"].
    const fields = {
      title, description,
      tech_stack: techStack.split(',').map(s => s.trim()).filter(Boolean),
      project_url: url, image_url: imageUrl,
    };
    const { error } = editingId
      ? await supabase.from('student_projects').update(fields).eq('id', editingId).eq('student_id', user.id)
      : await supabase.from('student_projects').insert({ student_id: user.id, ...fields });
    setSaving(false);
    if (error) { showToast('Could not save project: ' + error.message, 'error'); return; }
    showToast(editingId ? 'Project updated!' : 'Project added!', 'success');
    setShowForm(false);
    resetForm();
    load();
  };

  // Deletes a project, after the app's own confirmation popup (not the
  // browser's native confirm()) — a simple, no-frills way to prevent an
  // accidental click from instantly deleting someone's work.
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await supabase.from('student_projects').delete().eq('id', deleteTarget);
    setDeleting(false);
    setDeleteTarget(null);
    showToast('Project deleted', 'info');
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderGit2 size={20} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">My Projects</h2>
        </div>
        <button onClick={openNew} className="btn-primary btn-sm">
          <Plus size={14} /> Add Project
        </button>
      </div>

      {/* The "add project" form only exists in the page while
          `showForm` is true. */}
      {showForm && (
        <form onSubmit={create} className="card space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{editingId ? 'Edit Project' : 'New Project'}</h3>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. AI-powered Resume Analyzer" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What does it do? What problem does it solve?" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Tech Stack (comma separated)</label><input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, Python, TensorFlow" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Project URL (optional)</label><input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://github.com/you/project" className="input-field" /></div>
          {/* A styled "click to upload" box built from a real, invisible
              <input type="file"> (`hidden` on the input itself) wrapped
              in a clickable, styled <label> — clicking anywhere in the
              dashed box opens the file picker, since a <label> is linked
              to its <input> automatically. */}
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Screenshot (optional)</label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-4 transition-all hover:border-[var(--accent)]"><input type="file" accept="image/*" hidden onChange={handleImage} /><span className="text-sm text-[var(--text-secondary)]">{imageFile ? imageFile.name : imageUrl ? 'Screenshot attached — click to replace' : 'Click to upload screenshot'}</span></label></div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : editingId ? 'Update Project' : 'Save Project'}</button>
        </form>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}</div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <FolderGit2 size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No projects yet. Add your first project to showcase your work!</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p, i) => (
            <div key={p.id} className="card card-hover animate-fade-in cursor-pointer" style={{ animationDelay: `${i * 0.05}s` }} onClick={() => setViewProject(p)}>
              {/* The screenshot, if any, stretches to fill the top of the
                  card edge-to-edge (`-mx-6 -mt-6` cancels out the card's
                  own padding just for this image). */}
              {p.image_url && <div className="mb-3 -mx-6 -mt-6 h-32 overflow-hidden rounded-t-2xl"><img src={p.image_url} alt="" className="h-full w-full object-cover" /></div>}
              <h3 className="font-semibold">{p.title}</h3>
              {p.description && <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-3">{p.description}</p>}
              {p.tech_stack.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.tech_stack.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]"><Code2 size={10} /> {t}</span>)}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">{timeAgo(p.created_at)}</span>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setViewProject(p)} title="View" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Eye size={14} /></button>
                  <button onClick={() => startEdit(p)} title="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><Pencil size={14} /></button>
                  {/* Link button only shown if a project URL was actually provided. */}
                  {p.project_url && <a href={p.project_url} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><ExternalLink size={14} /></a>}
                  <button onClick={() => setDeleteTarget(p.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Read-only detail popup — shows the full project (untruncated
          description, full-size screenshot, all tech, link). */}
      {viewProject && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setViewProject(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-xl animate-fade-in-scale"
            onClick={(e) => e.stopPropagation()}
          >
            {viewProject.image_url && <img src={viewProject.image_url} alt="" className="max-h-64 w-full rounded-t-2xl object-cover" />}
            <div className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{viewProject.title}</h3>
                <button onClick={() => setViewProject(null)} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
              </div>
              {viewProject.description && <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{viewProject.description}</p>}
              {viewProject.tech_stack?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {viewProject.tech_stack.map(t => <span key={t} className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]"><Code2 size={11} /> {t}</span>)}
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-[var(--text-muted)]">{timeAgo(viewProject.created_at)}</span>
                <div className="flex items-center gap-2">
                  {viewProject.project_url && <a href={viewProject.project_url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink size={14} /> Open link</a>}
                  <button onClick={() => startEdit(viewProject)} className="btn-primary btn-sm"><Pencil size={14} /> Edit</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this project?"
        busy={deleting}
        busyLabel="Deleting…"
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
