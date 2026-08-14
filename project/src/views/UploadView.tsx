import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, saveProfile } from '@/lib/data';
import { Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react';

const SKILL_DICT = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Kotlin', 'Swift',
  'React', 'Next.js', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'FastAPI',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'REST',
  'HTML', 'CSS', 'Tailwind', 'SASS', 'Bootstrap',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Linux', 'Git',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'NLP', 'Statistics',
  'Networking', 'Security', 'Cybersecurity', 'Data Analysis', 'Data Science',
];

function extractFromText(text: string): { skills: string[]; cgpa?: string } {
  const lower = text.toLowerCase();
  const skills = SKILL_DICT.filter((s) => {
    const re = new RegExp(`\\b${s.replace(/[.+]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');
    return re.test(text) || lower.includes(s.toLowerCase());
  });
  let cgpa: string | undefined;
  const cgpaMatch = text.match(/(?:cgpa|gpa|c\.g\.p\.a)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/(\d\.\d{1,2})\s*\/\s*10/);
  if (cgpaMatch) cgpa = cgpaMatch[1];
  return { skills: [...new Set(skills)], cgpa };
}

async function readFileText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    return await file.text();
  }
  // For PDF/DOC: try raw text extraction from binary (works for simple PDFs with embedded text)
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let raw = '';
    // Decode as latin1 to keep binary-ish text streams readable for keyword search
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      if (c >= 32 && c < 127) raw += String.fromCharCode(c);
      else if (c === 10 || c === 13 || c === 9) raw += ' ';
    }
    return raw;
  } catch {
    return '';
  }
}

export function UploadView() {
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ filename: string; skills: string[]; cgpa?: string } | null>(null);

  const handleFile = async (file: File) => {
    if (!profile) return;
    setAnalyzing(true);
    setResult(null);

    const path = await uploadPrivateFile('resumes', file, profile.id);
    if (!path) {
      showToast('Upload failed', 'error');
      setAnalyzing(false);
      return;
    }

    let extractedSkills: string[] = [];
    let cgpa: string | undefined;

    // Prefer backend analyzer when available
    try {
      const res = await fetch('/api/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: path }),
      });
      if (res.ok) {
        const data = await res.json();
        extractedSkills = data.skills || [];
        cgpa = data.cgpa;
      }
    } catch {
      /* no API */
    }

    // Client-side extraction from file content
    if (extractedSkills.length === 0) {
      const text = await readFileText(file);
      if (text && text.length > 20) {
        const parsed = extractFromText(text);
        extractedSkills = parsed.skills;
        if (!cgpa && parsed.cgpa) cgpa = parsed.cgpa;
      }
    }

    // Also match against filename / known profile context
    if (extractedSkills.length === 0) {
      const fromName = extractFromText(file.name + ' ' + (profile.resume_text || '')).skills;
      extractedSkills = fromName;
    }

    if (extractedSkills.length === 0) {
      showToast('Could not detect skills automatically. Please add them on your Profile page.', 'info');
    }

    await saveProfile(profile.id, profile.email, {
      resume_filename: file.name,
      resume_text: extractedSkills.length ? extractedSkills.join(', ') : (profile.resume_text || file.name),
      skills: [...new Set([...(profile.skills || []), ...extractedSkills])],
      ...(cgpa ? { cgpa: parseFloat(cgpa) } : {}),
    });
    await refreshProfile();

    setResult({ filename: file.name, skills: extractedSkills, cgpa });
    setAnalyzing(false);
    showToast(extractedSkills.length ? 'Resume analyzed successfully' : 'Resume uploaded — add skills manually if needed', 'success');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="card max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold mb-4">Upload Documents</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Upload your resume (PDF, DOC, DOCX, or TXT). Skills and CGPA are extracted when possible and added to your profile.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
          dragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
        }`}
      >
        {analyzing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
            <p className="text-sm text-[var(--text-secondary)]">Analyzing resume…</p>
          </div>
        ) : (
          <>
            <Upload size={36} className="mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">Drag & drop your resume here</p>
            <p className="text-xs text-[var(--text-muted)] mb-4">PDF, DOC, DOCX, TXT</p>
            <label className="btn-primary btn-sm cursor-pointer inline-flex">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              Choose file
            </label>
          </>
        )}
      </div>

      {result && (
        <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span className="font-medium text-emerald-300">Analysis complete</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            <FileText size={14} className="inline mr-1" />
            {result.filename}
          </p>
          {result.cgpa && (
            <p className="text-sm text-[var(--text-secondary)] mb-2">Detected CGPA: <strong>{result.cgpa}</strong></p>
          )}
          {result.skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {result.skills.map((s) => (
                <span key={s} className="rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                  {s}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No skills auto-detected. Add them on the Profile page.</p>
          )}
        </div>
      )}

      {profile?.resume_filename && !result && (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Current resume on file: <strong>{profile.resume_filename}</strong>
        </p>
      )}
    </div>
  );
}
