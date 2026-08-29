// ============================================================================
// src/views/EventsView.tsx
//
// WHAT THIS FILE IS: the campus events page — placement drives, workshops,
// guest lectures. Companies/admins create events; students browse and
// register/unregister for them. Same "one component, two roles" pattern
// as AnnouncementsView.tsx (see the `isCompany` prop).
// ============================================================================

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { timeAgo } from '@/lib/data';
import { Calendar, MapPin, Users, Plus, X, Check, Clock, Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { Event, EventRegistration } from '@/lib/supabase';
import { Select } from '@/components/Select';

// Every event category this app supports, with a matching accent color.
const EVENT_TYPES = [
  { key: 'placement_drive', label: 'Placement Drive', color: '#38bdf8' },
  { key: 'workshop', label: 'Workshop', color: '#34d399' },
  { key: 'guest_lecture', label: 'Guest Lecture', color: '#fbbf24' },
  { key: 'seminar', label: 'Seminar', color: '#a78bfa' },
  { key: 'other', label: 'Other', color: '#94a3b8' },
];

type Props = {
  isCompany?: boolean;
};

export function EventsView({ isCompany }: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  // Each event is enriched with `registration_count` — a number NOT
  // stored directly on the event row, but calculated fresh each load (see
  // loadEvents below).
  const [events, setEvents] = useState<(Event & { registration_count?: number })[]>([]);
  // Which event IDs the CURRENT student has personally registered for —
  // kept as a `Set` for fast "am I registered for this one?" lookups
  // while rendering the list.
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('placement_drive');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  // Which event's registrant list (if any) is currently expanded, plus
  // the loaded registrants per event — fetched lazily, only once an
  // organizer actually opens that list, rather than for every event on
  // every page load.
  const [expandedRegs, setExpandedRegs] = useState<string | null>(null);
  const [registrants, setRegistrants] = useState<Record<string, { id: string; full_name: string; avatar_url: string; registered_at: string }[]>>({});
  const [loadingRegsFor, setLoadingRegsFor] = useState<string | null>(null);

  const loadEvents = async () => {
    // Soonest-first ordering (ascending on the actual event date, not
    // when it was created), so upcoming events naturally rise to the top.
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: true });
    const allEvents = (data as Event[]) || [];

    // If a student (not a company) is viewing, also fetch which of these
    // events THEY are registered for.
    if (profile && !isCompany) {
      const { data: regs } = await supabase.from('event_registrations').select('event_id').eq('student_id', profile.id);
      setRegisteredIds(new Set((regs as EventRegistration[])?.map(r => r.event_id) || []));
    }

    // For each event, count how many total people have registered.
    // `{ count: 'exact', head: true }` tells Supabase "just give me the
    // NUMBER of matching rows, don't actually send back all the row
    // data" — much more efficient than fetching every registration row
    // just to measure how many there are.
    //
    // `Promise.all(events.map(async (e) => ...))` runs all of these count
    // queries AT THE SAME TIME (in parallel) rather than one after
    // another — meaningfully faster when there are many events.
    const eventsWithCounts = await Promise.all(
      allEvents.map(async (e) => {
        const { count } = await supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('event_id', e.id);
        return { ...e, registration_count: count || 0 };
      })
    );
    setEvents(eventsWithCounts);
    setLoading(false);
  };

  useEffect(() => { loadEvents(); }, [profile]);

  const register = async (eventId: string) => {
    if (!profile) return;
    const { error } = await supabase.from('event_registrations').insert({ event_id: eventId, student_id: profile.id });
    if (error) { showToast('Could not register', 'error'); return; }
    showToast('Registered for event!', 'success');
    loadEvents();
  };

  const unregister = async (eventId: string) => {
    if (!profile) return;
    await supabase.from('event_registrations').delete().eq('event_id', eventId).eq('student_id', profile.id);
    showToast('Unregistered', 'info');
    loadEvents();
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('events').insert({
      title, description,
      // The <input type="datetime-local"> gives back a plain local-time
      // string with no timezone info — `new Date(...).toISOString()`
      // converts it into a proper, unambiguous UTC timestamp before
      // saving, so it displays correctly for every viewer regardless of
      // their own timezone.
      event_date: new Date(eventDate).toISOString(),
      event_type: eventType, location, link, organizer_id: profile.id,
      organizer_name: profile.full_name || profile.email,
    });
    setSaving(false);
    if (error) { showToast('Could not create event: ' + error.message, 'error'); return; }
    showToast('Event created!', 'success');
    setShowForm(false);
    setTitle(''); setDescription(''); setEventDate(''); setLocation(''); setLink(''); setEventType('placement_drive');
    loadEvents();
  };

  // Shows/hides the "who registered" list for one event. The actual
  // student names/avatars are fetched only the first time it's opened
  // (then cached in `registrants`) — there's no reason to re-fetch on
  // every toggle. RLS (`select_registrations`) already restricts this to
  // the event's own organizer, so no student can see who else signed up
  // for someone else's event.
  const toggleRegistrants = async (eventId: string) => {
    if (expandedRegs === eventId) { setExpandedRegs(null); return; }
    setExpandedRegs(eventId);
    if (registrants[eventId]) return; // already loaded once
    setLoadingRegsFor(eventId);
    const { data: regs } = await supabase
      .from('event_registrations')
      .select('student_id, registered_at')
      .eq('event_id', eventId)
      .order('registered_at', { ascending: true });
    const ids = (regs || []).map((r: { student_id: string }) => r.student_id);
    let profs: { id: string; full_name: string; avatar_url: string }[] = [];
    if (ids.length > 0) {
      const { data } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids);
      profs = (data as { id: string; full_name: string; avatar_url: string }[]) || [];
    }
    const profMap = new Map(profs.map((p) => [p.id, p]));
    const list = (regs || []).map((r: { student_id: string; registered_at: string }) => ({
      id: r.student_id,
      full_name: profMap.get(r.student_id)?.full_name || 'User',
      avatar_url: profMap.get(r.student_id)?.avatar_url || '',
      registered_at: r.registered_at,
    }));
    setRegistrants((prev) => ({ ...prev, [eventId]: list }));
    setLoadingRegsFor(null);
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    await supabase.from('events').delete().eq('id', id);
    showToast('Event deleted', 'info');
    loadEvents();
  };

  // Looks up an event type's display metadata, falling back to the
  // 'other' entry (the last one in EVENT_TYPES) if the type is somehow
  // unrecognized.
  const typeMeta = (t: string) => EVENT_TYPES.find(e => e.key === t) || EVENT_TYPES[4];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-[var(--accent)]" />
          <h2 className="text-lg font-semibold">Events</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary btn-sm">
          <Plus size={14} /> {isCompany ? 'Post Event' : 'Create Event'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createEvent} className="card space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">New Event</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--text-muted)] hover:text-rose-400"><X size={20} /></button>
          </div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Nimbus Labs Placement Drive" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What to expect, eligibility, etc." className="input-field" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Date & Time</label><input type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className="input-field" /></div>
            <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Type</label><Select value={eventType} onChange={setEventType} options={EVENT_TYPES.map(t => ({ value: t.key, label: t.label }))} /></div>
          </div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Seminar Hall A" className="input-field" /></div>
          <div><label className="mb-2 block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Link (optional)</label><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://zoom.us/… or a registration page" className="input-field" /></div>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Creating…' : 'Create Event'}</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
      ) : events.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <Calendar size={32} className="text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No events scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e, i) => {
            const meta = typeMeta(e.event_type);
            const isRegistered = registeredIds.has(e.id);
            const isPast = new Date(e.event_date).getTime() < Date.now();
            const isOwner = profile?.id === e.organizer_id;
            return (
              <div key={e.id} className="card animate-fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl text-xs font-bold text-white flex-shrink-0" style={{ background: meta.color }}>
                      <Calendar size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{e.title}</h3>
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-medium" style={{ background: `${meta.color}25`, color: meta.color }}>{meta.label}</span>
                        {/* An "Ended" badge for events whose date has
                            already passed — computed on the fly from the
                            current time, not stored as a separate flag. */}
                        {isPast && <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-400">Ended</span>}
                      </div>
                      {e.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{e.description}</p>}
                      <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-muted)] flex-wrap">
                        {/* `toLocaleString` formats the stored UTC
                            timestamp into the VIEWER's own local date/time
                            automatically — the browser handles the
                            timezone conversion, we don't have to. */}
                        <span className="flex items-center gap-1"><Clock size={12} /> {new Date(e.event_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        {e.location && <span className="flex items-center gap-1"><MapPin size={12} /> {e.location}</span>}
                        {e.link && (
                          <a href={e.link} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()} className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                            <LinkIcon size={12} /> Event link
                          </a>
                        )}
                        {/* Only the organizer can expand this into the
                            actual list of who registered — everyone else
                            just sees the count. */}
                        {isOwner ? (
                          <button onClick={() => toggleRegistrants(e.id)} className="flex items-center gap-1 hover:text-[var(--accent)]">
                            <Users size={12} /> {e.registration_count} registered
                            {expandedRegs === e.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1"><Users size={12} /> {e.registration_count} registered</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Three-way choice for the action button: the
                        organizer sees Delete; a student sees
                        Register/Registered (but only for events that
                        haven't already happened); a company viewing
                        someone else's event sees nothing at all. */}
                    {isOwner ? (
                      <button onClick={() => deleteEvent(e.id)} className="btn-ghost btn-sm text-rose-400 hover:text-rose-300">Delete</button>
                    ) : !isCompany && !isPast ? (
                      isRegistered ? (
                        <button onClick={() => unregister(e.id)} className="btn-ghost btn-sm"><Check size={14} /> Registered</button>
                      ) : (
                        <button onClick={() => register(e.id)} className="btn-primary btn-sm">Register</button>
                      )
                    ) : null}
                  </div>
                </div>
                {/* The expanded registrant list — each registered
                    student's name (and their ID, so the organizer knows
                    exactly who signed up, not just how many). */}
                {isOwner && expandedRegs === e.id && (
                  <div className="mt-3 border-t border-[var(--border)] pt-3 animate-slide-down">
                    {loadingRegsFor === e.id ? (
                      <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-8" />)}</div>
                    ) : (registrants[e.id]?.length || 0) === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">No one has registered yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {registrants[e.id].map((r) => (
                          <div key={r.id} className="flex items-center gap-2 text-xs">
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)] text-[9px] font-bold text-[var(--text-muted)]">{r.full_name.slice(0, 2).toUpperCase()}</div>
                            )}
                            <span className="font-medium">{r.full_name}</span>
                            <span className="text-[var(--text-muted)]">· ID: {r.id}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
