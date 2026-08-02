import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { uploadPublicFile, timeAgo } from '@/lib/data';
import { FolderGit2, Plus, X, Trash2, ExternalLink, Code2 } from 'lucide-react';
import type { StudentProject } from '@/lib/supabase';

export function ProjectsView() {
  const { profile, user } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [techStack, setTechStack] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from('student_projects').select('*').eq('student_id', user.id).order('created_at', { ascending: false });
    setProjects((data as StudentProject[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setImageFile(file);
    const url = await uploadPublicFile('banners', file, user.id);
    if (url) setImageUrl(url);
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('student_projects').insert({
      student_id: user.id, title, description,
      tech_stack: techStack.split(',').map(s => s.trim()).filter(Boolean),
      project_url: projectUrl, image_url: imageUrl,
    });
    setSaving(false);
    if (error) { showToast('Could not save project: ' + error.message, 'error'); return; }
    showToast('Project added!', 'success');
    setShowForm(false);
    setTitle(''); setDescription(''); setTechStack(''); setProjectUrl(''); setImageUrl(''); setImageFile(null);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    await supabase.from('student_projects').delete().eq('id', id);
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
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
          <Plus size={14} /> Add Project
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="card space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Project</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. AI-powered Resume Analyzer" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What does it do? What problem does it solve?" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Tech Stack (comma separated)</label><input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="React, Python, TensorFlow" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Project URL (optional)</label><input value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://github.com/you/project" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Screenshot (optional)</label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] p-4 transition-all hover:border-[var(--accent)]"><input type="file" accept="image/*" hidden onChange={handleImage} /><span className="text-sm text-[var(--text-secondary)]">{imageFile ? imageFile.name : 'Click to upload screenshot'}</span></label></div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Project'}</button>
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
            <div key={p.id} className="card card-hover animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
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
                <div className="flex items-center gap-2">
                  {p.project_url && <a href={p.project_url} target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]"><ExternalLink size={14} /></a>}
                  <button onClick={() => remove(p.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
