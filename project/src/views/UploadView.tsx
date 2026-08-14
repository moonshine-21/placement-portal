// ============================================================================
// src/views/UploadView.tsx
//
// WHAT THIS FILE IS: the resume upload page — lets a student drag-and-drop
// or pick a resume file, then tries to automatically pull skills and CGPA
// out of it and add them to their profile, so they don't have to type
// everything in by hand.
//
// HONESTY NOTE on "AI resume parsing": this file FIRST tries calling
// /api/analyze-resume (presumably a smarter, real AI-based parser) — but
// that endpoint does not currently exist anywhere in this project's api/
// folder. The fetch call below will simply fail/404, and the try/catch
// silently falls through to the SIMPLER, purely client-side extraction
// method described below — which is what this app actually runs today.
// This is worth knowing for a presentation: "AI-powered resume parsing"
// isn't really AI here, it's a keyword-matching dictionary.
//
// HOW THE CLIENT-SIDE EXTRACTION ACTUALLY WORKS: it's a fixed dictionary
// of ~50 known skill names (SKILL_DICT below), and it just checks whether
// each one appears as a whole word anywhere in the resume's text. This is
// simple, fast, free, and has no dependency on any AI service — but it
// will only ever recognize skills that are already in that fixed list,
// and it can't understand context (e.g. it can't tell "I do NOT know
// React" from "I know React" — it would flag React as a skill either way).
// ============================================================================

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { uploadPrivateFile, saveProfile } from '@/lib/data';
import { Upload, FileText, CheckCircle2, Loader2 } from 'lucide-react';

// The fixed dictionary of skill names this app knows how to recognize —
// add a name here to make it detectable in future resume uploads.
const SKILL_DICT = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Kotlin', 'Swift',
  'React', 'Next.js', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'Spring', 'FastAPI',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'REST',
  'HTML', 'CSS', 'Tailwind', 'SASS', 'Bootstrap',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'CI/CD', 'Linux', 'Git',
  'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'NLP', 'Statistics',
  'Networking', 'Security', 'Cybersecurity', 'Data Analysis', 'Data Science',
];

// Scans a block of plain text for any of the dictionary's skill names, and
// also tries to spot a CGPA number written nearby the word "CGPA"/"GPA"
// (or written as "X.XX/10", a common CGPA format).
function extractFromText(text: string): { skills: string[]; cgpa?: string } {
  const lower = text.toLowerCase();
  const skills = SKILL_DICT.filter((s) => {
    // Build a "whole word" regex for this skill name, so searching for
    // "Go" doesn't accidentally match inside unrelated words like
    // "Google" or "algorithm". `\b` means "word boundary" in regex.
    // `.replace(/[.+]/g, '\\$&')` escapes characters like "." and "+"
    // that would otherwise have special regex meaning (e.g. "C++" needs
    // its plus signs escaped, or the regex would break).
    const re = new RegExp(`\\b${s.replace(/[.+]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i');
    return re.test(text) || lower.includes(s.toLowerCase());
  });
  let cgpa: string | undefined;
  // Try two different common ways a CGPA might be written: "CGPA: 8.5" /
  // "GPA - 8.5", OR just "8.50/10" on its own.
  const cgpaMatch = text.match(/(?:cgpa|gpa|c\.g\.p\.a)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i)
    || text.match(/(\d\.\d{1,2})\s*\/\s*10/);
  if (cgpaMatch) cgpa = cgpaMatch[1];
  // `[...new Set(skills)]` removes any duplicate matches (e.g. if "REST"
  // and "REST API" both matched the same resume) before returning.
  return { skills: [...new Set(skills)], cgpa };
}

// Turns an uploaded file into a block of searchable plain text.
async function readFileText(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  // Plain text formats can just be read directly.
  if (ext === 'txt' || ext === 'md' || ext === 'csv') {
    return await file.text();
  }
  // For PDF/DOC files, there's no proper document parser here — instead,
  // this does a crude "brute-force" pass over the file's raw bytes,
  // keeping only the printable ASCII characters and discarding anything
  // else. This works reasonably well for SIMPLE PDFs where the text is
  // stored in a fairly plain, uncompressed way, but will produce garbled
  // or empty results for more complex/compressed/scanned-image PDFs — a
  // real limitation worth being upfront about, not a full PDF parser.
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let raw = '';
    // Walk every single byte in the file. Keep it if it's a normal
    // printable ASCII character (codes 32-126); turn newlines/tabs into a
    // plain space; silently drop everything else (binary formatting
    // bytes, compressed data, etc).
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
  const [dragging, setDragging] = useState(false); // is a file currently being dragged over the drop zone? (purely visual — highlights the box)
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ filename: string; skills: string[]; cgpa?: string } | null>(null);

  // The whole upload → extract → save pipeline, run for whichever file
  // the person provided (via drag-drop or the file picker — both paths
  // call this same function).
  const handleFile = async (file: File) => {
    if (!profile) return;
    setAnalyzing(true);
    setResult(null);

    // Step 1: upload the raw file to private storage (see
    // src/lib/data.ts's uploadPrivateFile) — this happens regardless of
    // whether skill extraction succeeds, since keeping the actual resume
    // file on record is the main point even without any auto-detection.
    const path = await uploadPrivateFile('resumes', file, profile.id);
    if (!path) {
      showToast('Upload failed', 'error');
      setAnalyzing(false);
      return;
    }

    let extractedSkills: string[] = [];
    let cgpa: string | undefined;

    // Step 2: TRY the (currently nonexistent, see the file-top note)
    // smarter backend analyzer first — if it were implemented, this would
    // let it take priority over the simpler local method below.
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
      /* no API — falls through to the client-side method below, which is what actually runs today */
    }

    // Step 3: the REAL extraction method that currently runs — read the
    // file's text and scan it against SKILL_DICT.
    if (extractedSkills.length === 0) {
      const text = await readFileText(file);
      if (text && text.length > 20) {
        const parsed = extractFromText(text);
        extractedSkills = parsed.skills;
        if (!cgpa && parsed.cgpa) cgpa = parsed.cgpa;
      }
    }

    // Step 4: last resort — if the file's own content yielded nothing
    // (e.g. an image-based scanned PDF with no real extractable text),
    // try scanning the FILENAME itself plus whatever resume text was
    // already saved from a previous upload, just in case that surfaces
    // something (e.g. a filename like "React_Resume.pdf").
    if (extractedSkills.length === 0) {
      const fromName = extractFromText(file.name + ' ' + (profile.resume_text || '')).skills;
      extractedSkills = fromName;
    }

    if (extractedSkills.length === 0) {
      showToast('Could not detect skills automatically. Please add them on your Profile page.', 'info');
    }

    // Save everything to the profile: the resume filename, a text
    // summary, and MERGE the newly-found skills into whatever skills the
    // student already had listed (rather than replacing their list
    // entirely — `[...new Set([...old, ...new])]` combines both lists and
    // removes any duplicates). Only touches `cgpa` if one was actually detected.
    await saveProfile(profile.id, profile.email, {
      resume_filename: file.name,
      resume_text: extractedSkills.length ? extractedSkills.join(', ') : (profile.resume_text || file.name),
      skills: [...new Set([...(profile.skills || []), ...extractedSkills])],
      ...(cgpa ? { cgpa: parseFloat(cgpa) } : {}),
    });
    await refreshProfile(); // pull the freshly-saved profile back into the app's shared auth state

    setResult({ filename: file.name, skills: extractedSkills, cgpa });
    setAnalyzing(false);
    showToast(extractedSkills.length ? 'Resume analyzed successfully' : 'Resume uploaded — add skills manually if needed', 'success');
  };

  // Handles a file being dropped onto the drag-and-drop zone.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); // stops the browser's default behavior of trying to OPEN the dropped file as a new page
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

      {/* The big drag-and-drop zone. Its border color changes while a
          file is being dragged over it (`dragging` state), giving clear
          visual feedback that dropping here will do something. */}
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
            {/* Same "styled label wraps a hidden file input" pattern used
                in ProjectsView.tsx — clicking this button opens the OS
                file picker. */}
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

      {/* Once analysis finishes, show a summary of what was found. */}
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

      {/* If there's no NEW result yet but they already have a resume on
          file from a previous visit, mention it — so the page doesn't
          look totally empty/unhelpful on a repeat visit. */}
      {profile?.resume_filename && !result && (
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Current resume on file: <strong>{profile.resume_filename}</strong>
        </p>
      )}
    </div>
  );
}
