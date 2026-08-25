// ============================================================================
// src/components/CallManager.tsx
//
// WHAT THIS FILE IS: the video/voice calling feature — the most technically
// involved file in this app. It handles ringing, accepting/declining,
// showing the live video feeds, and hanging up, for both casual
// friend-to-friend calls and company "interview" calls.
//
// THE BIG IDEA — WebRTC: video/audio calling works using a browser
// technology called WebRTC ("Web Real-Time Communication"), which lets two
// browsers send video/audio DIRECTLY to each other — not routed through
// our own server — once a connection is set up. Our server's only real
// job is "introductions": helping the two browsers find each other and
// swap the technical details needed to connect (this exchange is called
// "signaling"). Once that handshake finishes, the actual call itself
// flows peer-to-peer between the two browsers, which is faster and cheaper
// than relaying every video frame through our own servers.
//
// HOW SIGNALING WORKS HERE: instead of a dedicated signaling server, this
// app cleverly reuses Supabase's "Realtime" feature (broadcast channels) as
// the messenger — the two browsers join the same named channel and pass
// small JSON messages back and forth (an "offer," an "answer," and several
// "ice-candidates" — explained more below) until a direct connection forms.
//
// THE VOCABULARY, IN PLAIN TERMS:
//   RTCPeerConnection — the browser's built-in WebRTC connection object;
//                        one is created per call.
//   Offer / Answer     — two browsers exchange these one-time messages,
//                        like "here's what I can send/receive" and "okay,
//                        here's what I'll actually send/receive back" —
//                        this negotiation is called SDP (Session
//                        Description Protocol).
//   ICE candidates      — each browser's list of possible network paths it
//                        could be reached at (its own IP, plus any it
//                        learns about via STUN — see below). Both sides
//                        trade these and try them until one pair actually
//                        connects.
//   STUN server          — a public server (Google's, in this file) that a
//                        browser asks "what does my connection look like
//                        from the outside?" — needed because most devices
//                        sit behind a home/office router (NAT) that hides
//                        their true public address.
//   TURN server           — an optional relay server used as a LAST resort
//                        when a truly direct connection can't be made
//                        (e.g. very restrictive networks). This file
//                        tries to fetch TURN credentials from our own
//                        server (see the fetch to /api/turn-credentials);
//                        if that's not configured, calls still work for
//                        most networks using STUN alone.
// ============================================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User as UserIcon } from 'lucide-react';
import type { Call, Profile } from '@/lib/supabase';

// Google's free public STUN servers — used as a fallback/baseline even if
// our own TURN server isn't configured, since STUN alone is enough to
// connect most networks.
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RING_TIMEOUT = 45000;    // if nobody answers within 45 seconds, treat it as a missed call
const CONNECT_TIMEOUT = 45000; // if the peer-to-peer connection hasn't actually formed within 45 seconds of being "accepted," give up

// The four states this whole component can be in at any moment — which
// one determines what (if anything) gets rendered on screen at the bottom
// of this file.
type CallState = 'idle' | 'outgoing' | 'incoming' | 'active';

type Props = {
  // Set by App.tsx (via some other view calling its `startCall` function)
  // to kick off a NEW outgoing call. Cleared back to null once consumed
  // (see the `onCallConsumed` call inside the effect below) — this is a
  // one-shot "please place this call" instruction, not ongoing state.
  startCallRequest: { calleeId: string; callType: 'friend' | 'interview' } | null;
  onCallConsumed: () => void;
};

export function CallManager({ startCallRequest, onCallConsumed }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>('idle');
  // Details about the OTHER person, shown on screen — which one is
  // populated (callerInfo vs calleeInfo) depends on whether WE'RE
  // receiving a call or placing one.
  const [callerInfo, setCallerInfo] = useState<{ id: string; name: string; avatar: string; callType: string } | null>(null);
  const [calleeInfo, setCalleeInfo] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [callId, setCallId] = useState<string | null>(null); // the current call's row ID in the `calls` table
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [callStatus, setCallStatus] = useState('Ringing…'); // small status text shown during the call ("Ringing…", "Connecting…", "In call")
  const [elapsed, setElapsed] = useState(0); // seconds since the call actually connected — drives the "01:23" timer shown during an active call
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Refs (values that persist across re-renders WITHOUT triggering
  // one, unlike useState) ----
  // WebRTC/signaling machinery needs to be readable/writable from inside
  // event handlers set up much earlier, so plain `let` variables wouldn't
  // work (they'd be "stale," frozen at whatever value they had when the
  // handler was first created) — refs solve this the same way they solve
  // it in ParticleBackground.tsx's `themeRef`.
  const rtcPeerRef = useRef<RTCPeerConnection | null>(null);       // the actual WebRTC connection for this call
  const localStreamRef = useRef<MediaStream | null>(null);         // our own camera/mic feed
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null); // the Supabase channel used to exchange offer/answer/ICE messages
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null); // a separate channel watching the `calls` database row for status changes (accepted/declined/ended)
  const callsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);  // a channel watching for brand NEW incoming calls
  const activeCallIdRef = useRef<string | null>(null);
  const incomingCallIdRef = useRef<string | null>(null);
  const offerSentRef = useRef(false);      // has the offer already been sent this call? (prevents accidentally sending it twice)
  const answerReceivedRef = useRef(false); // same idea, for the answer
  const pendingIceRef = useRef<RTCIceCandidate[]>([]); // ICE candidates that arrived BEFORE we were ready to use them yet (see flushPendingIce below)
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);  // the small "picture in picture" video showing OUR OWN camera
  const remoteVideoRef = useRef<HTMLVideoElement>(null); // the big video showing the OTHER person

  // Tears down absolutely everything related to the current call — stops
  // the camera/mic, closes the WebRTC connection, disconnects from the
  // signaling channels, clears any pending timers. Called whenever a call
  // ends, for any reason (hung up, declined, failed, or the other side left).
  const cleanup = () => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    if (rtcPeerRef.current) { try { rtcPeerRef.current.close(); } catch { /* already closed, ignore */ } rtcPeerRef.current = null; }
    if (signalChannelRef.current) { try { supabase.removeChannel(signalChannelRef.current); } catch { /* */ } signalChannelRef.current = null; }
    if (statusChannelRef.current) { try { supabase.removeChannel(statusChannelRef.current); } catch { /* */ } statusChannelRef.current = null; }
    if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    setElapsed(0);
    offerSentRef.current = false; answerReceivedRef.current = false; pendingIceRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  // Formats a seconds count as "M:SS" (or "H:MM:SS" for a very long call) —
  // used by the little call-duration timer shown once a call is connected.
  const formatElapsed = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
    const ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // The "hang up" action — marks the call as ended in the database (so
  // the other person's side notices, via subscribeCallStatus below),
  // tells the other browser directly too (the 'bye' broadcast message, a
  // faster path than waiting for the database update to propagate), then
  // tears everything down locally.
  const endCall = async (id: string | null) => {
    if (id) {
      try {
        await supabase.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', id);
      } catch { /* best-effort — cleanup below still happens either way */ }
    }
    if (signalChannelRef.current) {
      try {
        signalChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: user?.id } });
      } catch { /* ignore — the database update above is the reliable fallback */ }
    }
    cleanup();
    setState('idle'); setCallId(null); setCallerInfo(null); setCalleeInfo(null);
    activeCallIdRef.current = null; incomingCallIdRef.current = null;
  };

  // Asks our own server for TURN relay credentials (see the "TURN server"
  // explanation at the top of this file). Falls back to STUN-only if that
  // endpoint isn't configured/available — calls still generally work,
  // just with a slightly lower success rate on unusual networks.
  const getIceServers = async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch('/api/turn-credentials', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.iceServers) && data.iceServers.length) return [...FALLBACK_ICE_SERVERS, ...data.iceServers];
      }
    } catch { /* fall through to the STUN-only fallback below */ }
    return FALLBACK_ICE_SERVERS;
  };

  // THE CORE SETUP FUNCTION — called once a call is either being placed
  // (isCaller = true) or accepted (isCaller = false). Gets access to the
  // camera/mic, creates the WebRTC connection, and sets up every event
  // handler needed to actually negotiate and maintain the call.
  const prepareCall = async (id: string, isCaller: boolean, otherProfile?: { name: string; avatar: string }) => {
    // Ask the browser for camera + microphone access. If the person
    // denies camera access (or has no camera), fall back to audio-only
    // rather than failing the whole call.
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setCameraOn(false);
      } catch {
        // No camera AND no microphone access — the call will still
        // technically connect, just without any local media to send.
      }
    }
    // Show our own camera feed in the little corner video preview.
    // `muted = true` on our OWN video prevents an audio feedback loop
    // (hearing yourself through your own speakers).
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }

    const iceServers = await getIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    rtcPeerRef.current = peer;

    // Add our own camera/mic tracks to the connection, so the OTHER side
    // will receive them.
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    // Build up the stream of the OTHER person's video/audio as it
    // arrives. Video and audio tracks can arrive as SEPARATE events
    // rather than bundled together — this collects them into one
    // MediaStream, checking `.some(...)` first so the same track never
    // gets added twice if the event fires more than once for it.
    const remoteStream = new MediaStream();
    peer.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      if (!e.streams[0] && e.track) {
        if (!remoteStream.getTracks().some((t) => t.id === e.track.id)) {
          remoteStream.addTrack(e.track);
        }
      }
      const el = remoteVideoRef.current;
      if (el) {
        el.srcObject = remoteStream;
        el.muted = false;
        el.volume = 1;
        el.play().catch(() => {
          // Some browsers block autoplay with sound until the user has
          // interacted with the page — retry shortly after, by which
          // point they almost certainly have (they just answered a call).
          setTimeout(() => el.play().catch(() => {}), 300);
        });
      }
      setCallStatus('In call');
      if (isCaller) setState('active'); // see the matching comment in onconnectionstatechange below — same race, same fix
      if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    };
    // Watches the OVERALL health of the peer-to-peer connection.
    peer.onconnectionstatechange = () => {
      const cs = peer.connectionState;
      if (cs === 'connected') {
        setCallStatus('In call');
        // BUG FIX: the caller's peer connection can finish negotiating
        // (via the broadcast 'signal' channel — offer/answer/ICE) BEFORE
        // the 'accepted' row-update reaches us over the separate
        // `call-status-${id}` postgres_changes channel, which is what
        // actually flips `state` to 'active' (see subscribeCallStatus
        // below). Realtime broadcasts are near-instant; a database write
        // + WAL + realtime fan-out is a bit slower — so there's a real
        // window where the connection is already live but the screen is
        // still showing the "Calling…" ring screen with a stale
        // "In call" status pill glued onto it (looks broken, even though
        // audio/video are already flowing). Flipping state here too,
        // defensively, means whichever signal arrives first is the one
        // that ends the ringing screen, instead of the two ever
        // disagreeing.
        if (isCaller) setState('active');
        if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
        if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
        // Start the "01:23"-style call timer the moment we're actually
        // connected — but only once per call (a brief disconnected ->
        // connected blip shouldn't reset the clock back to zero).
        if (!elapsedTimerRef.current) {
          elapsedTimerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        }
      }
      else if (cs === 'failed') { endCall(id); } // couldn't establish/maintain a connection at all — give up
      else if (cs === 'disconnected') {
        setCallStatus('Reconnecting…');
        // A "disconnected" state often recovers on its own within a few
        // seconds (a brief WiFi hiccup, a moment of packet loss), but
        // sometimes it needs a nudge — `restartIce()` asks both sides to
        // re-run ICE (re-gather/re-try network paths) without tearing
        // down and re-negotiating the whole call from scratch. It's a
        // no-op if the browser is already recovering on its own.
        try { peer.restartIce(); } catch { /* not fatal — the connectTimer safety net below still applies */ }
      }
    };
    // Every time the browser discovers a new possible network path
    // (a new "ICE candidate"), send it to the other side over our
    // signaling channel, so they can try connecting through it too.
    peer.onicecandidate = (e) => {
      if (e.candidate && signalChannelRef.current) {
        signalChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ice-candidate', from: user?.id, candidate: e.candidate } });
      }
    };

    // Open the shared Supabase Realtime channel both sides will use to
    // exchange signaling messages — named uniquely per call (`call-${id}`)
    // so different simultaneous calls never cross wires.
    const channel = supabase.channel(`call-${id}`, { config: { presence: { key: user?.id || 'anon' } } });
    signalChannelRef.current = channel;

    // THE SIGNALING MESSAGE HANDLER — this is the heart of the WebRTC
    // negotiation. Every message received on this channel is one small
    // step of "getting the two browsers talking directly."
    channel.on('broadcast', { event: 'signal' }, async (msg: any) => {
      const payload = msg.payload;
      if (payload.from === user?.id) return; // ignore our own messages echoing back to us

      if (payload.kind === 'ready') {
        // The callee's browser is ready to receive an offer — if we're
        // the caller and haven't sent one yet, send it now.
        if (isCaller && !offerSentRef.current && rtcPeerRef.current) await sendOffer(id);
      } else if (payload.kind === 'offer') {
        // We've received the caller's offer — build and send back our answer.
        if (!isCaller && rtcPeerRef.current) {
          await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          flushPendingIce(); // apply any ICE candidates that arrived before we had a remote description to attach them to
          const answer = await rtcPeerRef.current.createAnswer();
          await rtcPeerRef.current.setLocalDescription(answer);
          channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'answer', from: user?.id, sdp: answer } });
        }
      } else if (payload.kind === 'answer') {
        // We've received the callee's answer to OUR offer.
        if (isCaller && rtcPeerRef.current && !answerReceivedRef.current) {
          answerReceivedRef.current = true;
          await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          flushPendingIce();
        }
      } else if (payload.kind === 'ice-candidate') {
        // A network path the other side wants us to try. If we don't
        // have a remote description yet (the offer/answer swap hasn't
        // finished), we can't use it immediately — queue it up instead
        // (see pendingIceRef / flushPendingIce).
        if (rtcPeerRef.current) {
          if (rtcPeerRef.current.remoteDescription) {
            try { await rtcPeerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* a late/invalid candidate — safe to ignore */ }
          } else {
            pendingIceRef.current.push(new RTCIceCandidate(payload.candidate));
          }
        }
      } else if (payload.kind === 'bye') {
        // The other person hung up.
        cleanup(); setState('idle'); setCallId(null);
      }
    });

    // Supabase's "presence" feature tells each side when the OTHER
    // browser has actually joined this channel (not just subscribed, but
    // is really there). Once the caller sees the callee show up, that's
    // the trigger to send the offer — this avoids racing to send an
    // offer before anyone's listening for it yet.
    channel.on('presence', { event: 'sync' }, async () => {
      if (isCaller && !offerSentRef.current && rtcPeerRef.current) {
        const others = Object.keys(channel.presenceState()).filter((k) => k !== user?.id);
        if (others.length > 0) await sendOffer(id);
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() }); // announce our own presence on this channel
        if (!isCaller) {
          // The callee also proactively sends a couple of 'ready'
          // broadcasts (with a small delay between them, in case the
          // first arrives before the caller finishes subscribing) —
          // belt-and-suspenders alongside the presence-based trigger
          // above, since a broadcast message can occasionally be missed
          // if sent right as the other side is still connecting.
          for (let i = 0; i < 2; i++) {
            channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ready', from: user?.id } });
            if (i === 0) await new Promise((r) => setTimeout(r, 300));
          }
        }
      }
    });

    // Also watch the `calls` database row itself for status changes
    // (accepted/declined/ended) — a separate, more reliable channel from
    // the direct peer-to-peer signaling above, useful as a backstop.
    subscribeCallStatus(id, isCaller);

    // Safety net: if the connection hasn't actually reached "connected"
    // within CONNECT_TIMEOUT of the two sides actually starting to
    // negotiate, give up rather than leaving both sides stuck on a
    // "Connecting…" screen forever.
    //
    // IMPORTANT — this used to be started here unconditionally, which was
    // a real bug: for the CALLER, `prepareCall` runs the moment the call
    // is PLACED (while it's still ringing), so this timer's clock was
    // silently running for the whole ring duration too. If the other
    // person took, say, 40 of the 45 allowed ringing seconds to hit
    // Accept, the caller's connection had only ~5 seconds left on a timer
    // that had already been running — nowhere near enough time to
    // actually finish the offer/answer/ICE handshake (especially once a
    // TURN relay is involved, which takes a bit longer to set up than
    // direct STUN). That mismatch is a big part of why calls could
    // connect on the ringing screen but then go nowhere: this safety net
    // was firing and hanging up right as the real connection was still
    // forming. So now: the callee (who only ever calls prepareCall AT the
    // moment they accept) starts the timer here, since that timing is
    // already correct — but the caller's timer is started separately,
    // from `subscribeCallStatus` below, only once we actually know the
    // other person accepted (see the 'accepted' branch there).
    if (!isCaller) startConnectTimer(id);
  };

  // (Re)starts the "give up if we're not connected soon" safety timer —
  // pulled out into its own function so both the callee (right when
  // `prepareCall` runs, above) and the caller (only once the callee has
  // actually accepted, see `subscribeCallStatus` below) can start it at
  // the moment that's actually correct for each of them.
  const startConnectTimer = (id: string) => {
    if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
    connectTimerRef.current = setTimeout(() => {
      if (rtcPeerRef.current && rtcPeerRef.current.connectionState !== 'connected') endCall(id);
    }, CONNECT_TIMEOUT);
  };

  // Applies any ICE candidates that arrived before we had a
  // remoteDescription to attach them to, in the order they arrived.
  const flushPendingIce = async () => {
    while (pendingIceRef.current.length) {
      const c = pendingIceRef.current.shift()!;
      try { await rtcPeerRef.current?.addIceCandidate(c); } catch { /* */ }
    }
  };

  // Builds and sends the initial "offer" (the caller's opening move in the
  // SDP negotiation described at the top of this file).
  const sendOffer = async (id: string) => {
    if (!rtcPeerRef.current || offerSentRef.current) return;
    offerSentRef.current = true;
    const offer = await rtcPeerRef.current.createOffer();
    await rtcPeerRef.current.setLocalDescription(offer);
    signalChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { kind: 'offer', from: user?.id, sdp: offer } });
  };

  // Watches the `calls` table row for this specific call, reacting to
  // status changes made from the OTHER side (e.g. them clicking accept/
  // decline, which updates the database, which this listener notices).
  const subscribeCallStatus = (id: string, isCaller: boolean) => {
    const ch = supabase.channel(`call-status-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (payload: any) => {
        const st = payload.new?.status;
        if (st === 'accepted' && isCaller) { setState('active'); setCallStatus('Connecting…'); startConnectTimer(id); }
        else if (st === 'declined' && isCaller) { cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null; }
        else if (st === 'ended' || st === 'missed') { cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null; }
      })
      .subscribe();
    statusChannelRef.current = ch;
  };

  // ---------- Start an OUTGOING call, triggered from ELSEWHERE in the
  // app via the `startCallRequest` prop ----------
  useEffect(() => {
    if (startCallRequest && user) {
      (async () => {
        const { data: callee } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', startCallRequest.calleeId).maybeSingle();
        const cp = callee as Profile | null;
        // A randomly-generated unique room name for this call.
        const roomName = 'call-' + Math.random().toString(36).slice(2, 12);
        // Create the actual call record in the database — this is what
        // triggers the OTHER person's "incoming call" listener below, via
        // Supabase realtime noticing the new row.
        const { data: callRow } = await supabase.from('calls').insert({
          caller_id: user.id, callee_id: startCallRequest.calleeId, call_type: startCallRequest.callType, room_name: roomName, status: 'ringing',
        }).select().single();
        const call = callRow as Call | null;
        if (!call) return;
        activeCallIdRef.current = call.id;
        setCallId(call.id);
        setCalleeInfo({ id: startCallRequest.calleeId, name: cp?.full_name || 'User', avatar: cp?.avatar_url || '' });
        setState('outgoing');
        setCallStatus(startCallRequest.callType === 'interview' ? 'Calling for an interview… Ringing' : 'Ringing…');
        // If nobody answers in time, mark it as missed.
        ringTimerRef.current = setTimeout(() => {
          if (activeCallIdRef.current === call.id) {
            supabase.from('calls').update({ status: 'missed', updated_at: new Date().toISOString() }).eq('id', call.id).eq('status', 'ringing').then(() => {
              cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null;
            });
          }
        }, RING_TIMEOUT);
        // Start setting up our side of the WebRTC connection right away
        // (getting camera access, creating the peer connection) — this
        // happens WHILE it's still ringing, so the call can connect the
        // instant the other person accepts, without extra delay.
        await prepareCall(call.id, true);
        onCallConsumed(); // tell the parent "I've picked up this request," so it clears it and won't re-trigger
      })();
    }
  }, [startCallRequest, user]);

  // ---------- Listen for INCOMING calls ----------
  // Subscribes once per logged-in user to be notified any time a new row
  // is inserted into `calls` with US as the callee.
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('calls-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${user.id}` }, async (payload: any) => {
        // Only react if we're currently idle — if we're already on
        // another call, a second incoming call shouldn't interrupt it
        // (this simple app doesn't support call-waiting).
        if (payload.new?.status === 'ringing' && state === 'idle') {
          const call = payload.new as Call;
          incomingCallIdRef.current = call.id;
          activeCallIdRef.current = call.id;
          setCallId(call.id);
          const { data: caller } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', call.caller_id).maybeSingle();
          const cp = caller as Profile | null;
          setCallerInfo({ id: call.caller_id, name: cp?.full_name || 'Someone', avatar: cp?.avatar_url || '', callType: call.call_type });
          setState('incoming');
          // If we don't answer in time, mark it missed on our end too.
          ringTimerRef.current = setTimeout(() => {
            supabase.from('calls').update({ status: 'missed', updated_at: new Date().toISOString() }).eq('id', call.id);
            cleanup(); setState('idle'); setCallId(null); incomingCallIdRef.current = null; activeCallIdRef.current = null;
          }, RING_TIMEOUT);
        }
      })
      .subscribe();
    callsChannelRef.current = ch;
    return () => { try { supabase.removeChannel(ch); } catch { /* */ } };
  }, [user, state]);

  // Accept an incoming call: mark it accepted in the database (this is
  // what flips the CALLER's screen from "ringing" to "connecting" via
  // their subscribeCallStatus listener), then set up our own side of the
  // WebRTC connection.
  const acceptCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    await supabase.from('calls').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', callId);
    setState('active'); setCallStatus('Connecting…');
    await prepareCall(callId, false);
  };

  // Decline an incoming call without ever setting up any media/connection.
  const declineCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    await supabase.from('calls').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', callId);
    cleanup(); setState('idle'); setCallId(null); incomingCallIdRef.current = null; activeCallIdRef.current = null;
  };

  // Cancel a call WE placed, before the other side has answered it.
  const cancelOutgoing = async () => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (callId) await supabase.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', callId);
    cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null;
  };

  // Mute/unmute and camera on/off simply flip the `.enabled` flag on the
  // relevant media track — this is a much lighter-weight operation than
  // stopping and restarting the whole camera/mic stream, and WebRTC
  // automatically handles telling the other side "this track is now
  // silent/blank" without needing any extra signaling of our own.
  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled); }
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  // When there's no call happening at all, render nothing — this
  // component sits invisible in the background the rest of the time,
  // just listening for incoming calls.
  if (state === 'idle') return null;

  // A tiny reusable avatar helper — shows the real photo if there is one,
  // otherwise a colored circle with initials, sized however the caller
  // asks (used at different sizes for the ring screens vs elsewhere). The
  // ring/glow around it is purely decorative polish for the call screens.
  const Avatar = ({ name, url, size = 64, ring = false }: { name: string; url: string; size?: number; ring?: boolean }) => (
    <div
      className={ring ? 'rounded-full p-1.5 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-lg shadow-[var(--accent)]/30' : ''}
      style={ring ? { animation: 'pulse-ring 2.4s ease-in-out infinite' } : undefined}
    >
      {url ? (
        <img src={url} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-black/40" />
      ) : (
        <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xl font-bold text-white border-2 border-black/40">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );

  // A reusable little status pill used on both ring screens ("Interview
  // call", "Ringing…", etc) — kept as one component so both screens stay
  // visually consistent.
  const StatusPill = ({ children }: { children: ReactNode }) => (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
      {children}
    </span>
  );

  return (
    <>
      {/* ---------- Incoming call ringing screen ---------- */}
      {state === 'incoming' && callerInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-black/80 via-black/70 to-black/85 backdrop-blur-xl p-4 animate-fade-in">
          <div className="relative flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl animate-fade-in-scale">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Incoming call</span>
            <Avatar name={callerInfo.name} url={callerInfo.avatar} size={88} ring />
            <div>
              <h2 className="text-xl font-bold text-white">{callerInfo.name}</h2>
              <div className="mt-2">
                <StatusPill>{callerInfo.callType === 'interview' ? 'Interview call' : 'Calling you…'}</StatusPill>
              </div>
            </div>
            <div className="flex items-center gap-8 mt-3">
              <div className="flex flex-col items-center gap-2">
                <button onClick={declineCall} className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-600 hover:scale-110 active:scale-95">
                  <PhoneOff size={26} />
                </button>
                <span className="text-[11px] text-white/50">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                {/* The pulsing-ring animation around the accept button
                    draws attention while it's ringing. */}
                <button onClick={acceptCall} className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-600 hover:scale-110 active:scale-95 animate-[pulse-ring_2s_infinite]">
                  <Phone size={26} />
                </button>
                <span className="text-[11px] text-white/50">Accept</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Outgoing call ringing screen ---------- */}
      {state === 'outgoing' && calleeInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-b from-black/80 via-black/70 to-black/85 backdrop-blur-xl p-4 animate-fade-in">
          <div className="relative flex w-full max-w-xs flex-col items-center gap-5 rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl animate-fade-in-scale">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Calling…</span>
            <Avatar name={calleeInfo.name} url={calleeInfo.avatar} size={88} ring />
            <div>
              <h2 className="text-xl font-bold text-white">{calleeInfo.name}</h2>
              <div className="mt-2"><StatusPill>{callStatus}</StatusPill></div>
            </div>
            <div className="flex flex-col items-center gap-2 mt-3">
              <button onClick={cancelOutgoing} className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-600 hover:scale-110 active:scale-95">
                <PhoneOff size={26} />
              </button>
              <span className="text-[11px] text-white/50">Cancel</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Active call screen (once connected) ---------- */}
      {state === 'active' && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#0a0a0f] animate-fade-in">
          {/* Top status bar — shows a live/connecting indicator, the
              other person's name, and the running call-duration timer
              once actually connected. */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/60 to-transparent absolute top-0 left-0 right-0 z-10">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${callStatus === 'In call' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
              <span className="text-sm font-medium text-white">{callerInfo?.name || calleeInfo?.name || 'Call'}</span>
              <span className="text-white/30">·</span>
              <span className="text-xs text-white/60">{callStatus === 'In call' ? formatElapsed(elapsed) : callStatus}</span>
            </div>
          </div>
          {/* The big remote video fills the screen; our own small
              "picture in picture" preview floats in the bottom-right. A
              soft placeholder avatar shows while the remote feed hasn't
              arrived yet, instead of a jarring blank black rectangle. */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#131320] to-[#05050a]">
            {callStatus !== 'In call' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-[1]">
                <Avatar name={(callerInfo || calleeInfo)?.name || '?'} url={(callerInfo || calleeInfo)?.avatar || ''} size={104} />
                <p className="text-sm text-white/50">{callStatus}</p>
              </div>
            )}
            <video ref={remoteVideoRef} autoPlay playsInline controls={false} className="h-full w-full object-cover bg-black relative z-[2]" />
            <div className="absolute bottom-5 right-5 h-32 w-24 sm:h-36 sm:w-48 overflow-hidden rounded-2xl border-2 border-white/15 bg-black shadow-2xl z-[3]">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ display: cameraOn ? 'block' : 'none' }} />
              {!cameraOn && <div className="flex h-full items-center justify-center text-white/40 text-xs">Camera off</div>}
            </div>
          </div>
          {/* Bottom control bar: mute, camera toggle, hang up. */}
          <div className="flex items-center justify-center gap-5 py-7 bg-gradient-to-t from-black/60 to-transparent">
            <button onClick={toggleMic} className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 ${micOn ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-white text-black'}`} title={micOn ? 'Mute' : 'Unmute'}>
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button onClick={toggleCamera} className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95 ${cameraOn ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-white text-black'}`} title={cameraOn ? 'Camera off' : 'Camera on'}>
              {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            <button onClick={() => endCall(callId)} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:bg-rose-600 hover:scale-110 active:scale-95" title="End call">
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
