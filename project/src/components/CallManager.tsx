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
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import type { Call, Profile } from '@/lib/supabase';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const RING_TIMEOUT = 45000;
const CONNECT_TIMEOUT = 60000;

type CallState = 'idle' | 'outgoing' | 'incoming' | 'active';

type Props = {
  startCallRequest: { calleeId: string; callType: 'friend' | 'interview' } | null;
  onCallConsumed: () => void;
};

export function CallManager({ startCallRequest, onCallConsumed }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>('idle');
  const [callerInfo, setCallerInfo] = useState<{ id: string; name: string; avatar: string; callType: string } | null>(null);
  const [calleeInfo, setCalleeInfo] = useState<{ id: string; name: string; avatar: string } | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [callStatus, setCallStatus] = useState('Ringing…');
  const [durationSec, setDurationSec] = useState(0);
  const [remoteReady, setRemoteReady] = useState(false);

  const rtcPeerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const statusChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const incomingCallIdRef = useRef<string | null>(null);
  const offerSentRef = useRef(false);
  const answerReceivedRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidate[]>([]);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const isCallerRef = useRef(false);

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (rtcPeerRef.current) {
      try { rtcPeerRef.current.close(); } catch { /* already closed */ }
      rtcPeerRef.current = null;
    }
    if (signalChannelRef.current) {
      try { supabase.removeChannel(signalChannelRef.current); } catch { /* */ }
      signalChannelRef.current = null;
    }
    if (statusChannelRef.current) {
      try { supabase.removeChannel(statusChannelRef.current); } catch { /* */ }
      statusChannelRef.current = null;
    }
    if (connectTimerRef.current) {
      clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    offerSentRef.current = false;
    answerReceivedRef.current = false;
    pendingIceRef.current = [];
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setRemoteReady(false);
    setDurationSec(0);
  };

  const endCall = async (id: string | null) => {
    if (id) {
      try {
        await supabase.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', id);
      } catch { /* best-effort */ }
    }
    if (signalChannelRef.current) {
      try {
        signalChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: user?.id } });
      } catch { /* ignore */ }
    }
    cleanup();
    setState('idle');
    setCallId(null);
    setCallerInfo(null);
    setCalleeInfo(null);
    activeCallIdRef.current = null;
    incomingCallIdRef.current = null;
  };

  const getIceServers = async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch('/api/turn-credentials', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.iceServers) && data.iceServers.length) {
          return [...FALLBACK_ICE_SERVERS, ...data.iceServers];
        }
      }
    } catch { /* fall through */ }
    return FALLBACK_ICE_SERVERS;
  };

  const attachLocalVideo = () => {
    const el = localVideoRef.current;
    const stream = localStreamRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = true;
      el.playsInline = true;
      el.play().catch(() => {
        setTimeout(() => el.play().catch(() => {}), 200);
      });
    }
  };

  const attachRemoteVideo = () => {
    const el = remoteVideoRef.current;
    const stream = remoteStreamRef.current;
    if (el && stream) {
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = false;
      el.volume = 1;
      el.playsInline = true;
      el.play().catch(() => {
        setTimeout(() => el.play().catch(() => {}), 200);
      });
      setRemoteReady(true);
    }
  };

  // When active UI mounts, re-attach streams (refs were null while on ring screens)
  useEffect(() => {
    if (state === 'active') {
      // small delay so the <video> elements are in the DOM
      const t = requestAnimationFrame(() => {
        attachLocalVideo();
        attachRemoteVideo();
      });
      return () => cancelAnimationFrame(t);
    }
  }, [state]);

  // Duration timer while in active call
  useEffect(() => {
    if (state === 'active') {
      setDurationSec(0);
      durationTimerRef.current = setInterval(() => {
        setDurationSec((s) => s + 1);
      }, 1000);
      return () => {
        if (durationTimerRef.current) {
          clearInterval(durationTimerRef.current);
          durationTimerRef.current = null;
        }
      };
    }
  }, [state]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const prepareCall = async (id: string, isCaller: boolean) => {
    isCallerRef.current = isCaller;

    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraOn(true);
    } catch {
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setCameraOn(false);
      } catch {
        // no media — call can still connect without local tracks
      }
    }

    // Attach if active UI already visible
    attachLocalVideo();

    const iceServers = await getIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    rtcPeerRef.current = peer;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer.addTrack(track, localStreamRef.current!);
      });
    }

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    peer.ontrack = (e) => {
      const tracks = e.streams?.[0]?.getTracks() || (e.track ? [e.track] : []);
      tracks.forEach((track) => {
        if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      remoteStreamRef.current = remoteStream;
      attachRemoteVideo();
      setCallStatus('In call');
    };

    peer.onconnectionstatechange = () => {
      const cs = peer.connectionState;
      if (cs === 'connected') {
        setCallStatus('In call');
        if (connectTimerRef.current) {
          clearTimeout(connectTimerRef.current);
          connectTimerRef.current = null;
        }
      } else if (cs === 'failed') {
        endCall(id);
      } else if (cs === 'disconnected') {
        setCallStatus('Reconnecting…');
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate && signalChannelRef.current) {
        signalChannelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'ice-candidate', from: user?.id, candidate: e.candidate },
        });
      }
    };

    const channel = supabase.channel(`call-${id}`, {
      config: { presence: { key: user?.id || 'anon' } },
    });
    signalChannelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, async (msg: any) => {
      const payload = msg.payload;
      if (payload.from === user?.id) return;

      if (payload.kind === 'ready') {
        if (isCaller && !offerSentRef.current && rtcPeerRef.current) await sendOffer();
      } else if (payload.kind === 'offer') {
        if (!isCaller && rtcPeerRef.current) {
          try {
            await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingIce();
            const answer = await rtcPeerRef.current.createAnswer();
            await rtcPeerRef.current.setLocalDescription(answer);
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { kind: 'answer', from: user?.id, sdp: answer },
            });
          } catch (err) {
            console.warn('Failed to handle offer:', err);
          }
        }
      } else if (payload.kind === 'answer') {
        if (isCaller && rtcPeerRef.current && !answerReceivedRef.current) {
          answerReceivedRef.current = true;
          try {
            await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            await flushPendingIce();
          } catch (err) {
            console.warn('Failed to handle answer:', err);
          }
        }
      } else if (payload.kind === 'ice-candidate') {
        if (rtcPeerRef.current) {
          if (rtcPeerRef.current.remoteDescription) {
            try {
              await rtcPeerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch { /* ignore late/invalid */ }
          } else {
            pendingIceRef.current.push(new RTCIceCandidate(payload.candidate));
          }
        }
      } else if (payload.kind === 'bye') {
        cleanup();
        setState('idle');
        setCallId(null);
        setCallerInfo(null);
        setCalleeInfo(null);
        activeCallIdRef.current = null;
        incomingCallIdRef.current = null;
      }
    });

    channel.on('presence', { event: 'sync' }, async () => {
      if (isCaller && !offerSentRef.current && rtcPeerRef.current) {
        const others = Object.keys(channel.presenceState()).filter((k) => k !== user?.id);
        if (others.length > 0) await sendOffer();
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
        if (!isCaller) {
          for (let i = 0; i < 3; i++) {
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: { kind: 'ready', from: user?.id },
            });
            if (i < 2) await new Promise((r) => setTimeout(r, 250));
          }
        }
      }
    });

    subscribeCallStatus(id, isCaller);
    connectTimerRef.current = setTimeout(() => {
      if (peer.connectionState !== 'connected') endCall(id);
    }, CONNECT_TIMEOUT);
  };

  const flushPendingIce = async () => {
    while (pendingIceRef.current.length) {
      const c = pendingIceRef.current.shift()!;
      try {
        await rtcPeerRef.current?.addIceCandidate(c);
      } catch { /* */ }
    }
  };

  const sendOffer = async () => {
    if (!rtcPeerRef.current || offerSentRef.current) return;
    offerSentRef.current = true;
    try {
      const offer = await rtcPeerRef.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await rtcPeerRef.current.setLocalDescription(offer);
      signalChannelRef.current?.send({
        type: 'broadcast',
        event: 'signal',
        payload: { kind: 'offer', from: user?.id, sdp: offer },
      });
    } catch (err) {
      console.warn('Failed to send offer:', err);
      offerSentRef.current = false;
    }
  };

  const subscribeCallStatus = (id: string, isCaller: boolean) => {
    const ch = supabase
      .channel(`call-status-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` },
        (payload: any) => {
          const st = payload.new?.status;
          if (st === 'accepted' && isCaller) {
            setState('active');
            setCallStatus('Connecting…');
            // re-attach after UI mounts
            setTimeout(() => {
              attachLocalVideo();
              attachRemoteVideo();
            }, 100);
          } else if (st === 'declined' && isCaller) {
            cleanup();
            setState('idle');
            setCallId(null);
            activeCallIdRef.current = null;
          } else if (st === 'ended' || st === 'missed') {
            cleanup();
            setState('idle');
            setCallId(null);
            activeCallIdRef.current = null;
          }
        }
      )
      .subscribe();
    statusChannelRef.current = ch;
  };

  // Start outgoing call
  useEffect(() => {
    if (startCallRequest && user) {
      (async () => {
        const { data: callee } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', startCallRequest.calleeId)
          .maybeSingle();
        const cp = callee as Profile | null;
        const roomName = 'call-' + Math.random().toString(36).slice(2, 12);
        const { data: callRow } = await supabase
          .from('calls')
          .insert({
            caller_id: user.id,
            callee_id: startCallRequest.calleeId,
            call_type: startCallRequest.callType,
            room_name: roomName,
            status: 'ringing',
          })
          .select()
          .single();
        const call = callRow as Call | null;
        if (!call) return;
        activeCallIdRef.current = call.id;
        setCallId(call.id);
        setCalleeInfo({
          id: startCallRequest.calleeId,
          name: cp?.full_name || 'User',
          avatar: cp?.avatar_url || '',
        });
        setState('outgoing');
        setCallStatus(
          startCallRequest.callType === 'interview' ? 'Calling for an interview…' : 'Ringing…'
        );
        ringTimerRef.current = setTimeout(() => {
          if (activeCallIdRef.current === call.id) {
            supabase
              .from('calls')
              .update({ status: 'missed', updated_at: new Date().toISOString() })
              .eq('id', call.id)
              .eq('status', 'ringing')
              .then(() => {
                cleanup();
                setState('idle');
                setCallId(null);
                activeCallIdRef.current = null;
              });
          }
        }, RING_TIMEOUT);
        await prepareCall(call.id, true);
        onCallConsumed();
      })();
    }
  }, [startCallRequest, user]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('calls-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${user.id}` },
        async (payload: any) => {
          if (payload.new?.status === 'ringing' && state === 'idle') {
            const call = payload.new as Call;
            incomingCallIdRef.current = call.id;
            activeCallIdRef.current = call.id;
            setCallId(call.id);
            const { data: caller } = await supabase
              .from('profiles')
              .select('full_name, avatar_url')
              .eq('id', call.caller_id)
              .maybeSingle();
            const cp = caller as Profile | null;
            setCallerInfo({
              id: call.caller_id,
              name: cp?.full_name || 'Someone',
              avatar: cp?.avatar_url || '',
              callType: call.call_type,
            });
            setState('incoming');
            ringTimerRef.current = setTimeout(() => {
              supabase
                .from('calls')
                .update({ status: 'missed', updated_at: new Date().toISOString() })
                .eq('id', call.id);
              cleanup();
              setState('idle');
              setCallId(null);
              incomingCallIdRef.current = null;
              activeCallIdRef.current = null;
            }, RING_TIMEOUT);
          }
        }
      )
      .subscribe();
    callsChannelRef.current = ch;
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch { /* */ }
    };
  }, [user, state]);

  const acceptCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    await supabase
      .from('calls')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', callId);
    setState('active');
    setCallStatus('Connecting…');
    await prepareCall(callId, false);
    // ensure videos attach after prepare
    setTimeout(() => {
      attachLocalVideo();
      attachRemoteVideo();
    }, 150);
  };

  const declineCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    await supabase
      .from('calls')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', callId);
    cleanup();
    setState('idle');
    setCallId(null);
    incomingCallIdRef.current = null;
    activeCallIdRef.current = null;
  };

  const cancelOutgoing = async () => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    if (callId) {
      await supabase
        .from('calls')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('id', callId);
    }
    cleanup();
    setState('idle');
    setCallId(null);
    activeCallIdRef.current = null;
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  if (state === 'idle') return null;

  const displayName =
    state === 'incoming'
      ? callerInfo?.name
      : state === 'outgoing'
        ? calleeInfo?.name
        : callerInfo?.name || calleeInfo?.name || 'Call';
  const displayAvatar =
    state === 'incoming'
      ? callerInfo?.avatar
      : state === 'outgoing'
        ? calleeInfo?.avatar
        : callerInfo?.avatar || calleeInfo?.avatar || '';

  const Avatar = ({ name, url, size = 96 }: { name: string; url: string; size?: number }) =>
    url ? (
      <img
        src={url}
        alt=""
        style={{ width: size, height: size }}
        className="rounded-full object-cover ring-4 ring-white/10 shadow-xl"
      />
    ) : (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-2xl font-bold text-white ring-4 ring-white/10 shadow-xl"
      >
        {(name || '?').slice(0, 2).toUpperCase()}
      </div>
    );

  return (
    <>
      {/* ---------- Incoming call ---------- */}
      {state === 'incoming' && callerInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-elevated)]/95 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex flex-col items-center gap-5 px-8 py-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Incoming {callerInfo.callType === 'interview' ? 'Interview' : 'Call'}
              </p>
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]/30" style={{ animationDuration: '2s' }} />
                <Avatar name={callerInfo.name} url={callerInfo.avatar} size={100} />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">{callerInfo.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {callerInfo.callType === 'interview' ? 'Interview call' : 'is calling you…'}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-6">
                <button
                  onClick={declineCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:scale-110 hover:bg-rose-600"
                  title="Decline"
                >
                  <PhoneOff size={26} />
                </button>
                <button
                  onClick={acceptCall}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-all hover:scale-110 hover:bg-emerald-600 animate-[pulse-ring_2s_infinite]"
                  title="Accept"
                >
                  <Phone size={26} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Outgoing call ---------- */}
      {state === 'outgoing' && calleeInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in">
          <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-elevated)]/95 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/20 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex flex-col items-center gap-5 px-8 py-10">
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                Calling…
              </p>
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)]/25" style={{ animationDuration: '1.5s' }} />
                <Avatar name={calleeInfo.name} url={calleeInfo.avatar} size={100} />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white">{calleeInfo.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{callStatus}</p>
              </div>
              <button
                onClick={cancelOutgoing}
                className="mt-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/30 transition-all hover:scale-110 hover:bg-rose-600"
                title="Cancel"
              >
                <PhoneOff size={26} />
              </button>
              <p className="text-xs text-[var(--text-muted)]">Cancel</p>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Active call ---------- */}
      {state === 'active' && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black animate-fade-in">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <p className="text-sm font-semibold text-white">{displayName}</p>
                <p className="text-xs text-white/60">
                  {callStatus === 'In call' ? formatDuration(durationSec) : callStatus}
                </p>
              </div>
            </div>
          </div>

          {/* Remote video (full screen) */}
          <div className="relative flex-1 bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              controls={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {!remoteReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[var(--bg-base)] to-black">
                <Avatar name={displayName || '?'} url={displayAvatar} size={120} />
                <p className="text-sm text-white/70">{callStatus}</p>
              </div>
            )}

            {/* Local PiP */}
            <div className="absolute bottom-28 right-4 h-36 w-28 overflow-hidden rounded-2xl border-2 border-white/20 bg-black shadow-2xl sm:h-40 sm:w-32">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                style={{ display: cameraOn ? 'block' : 'none' }}
              />
              {!cameraOn && (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--surface)] text-white/50">
                  <VideoOff size={20} />
                  <span className="text-[10px]">Camera off</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-5 pb-10 pt-16 bg-gradient-to-t from-black/90 to-transparent">
            <button
              onClick={toggleMic}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 ${
                micOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-black'
              }`}
              title={micOn ? 'Mute' : 'Unmute'}
            >
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button
              onClick={toggleCamera}
              className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 ${
                cameraOn ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-black'
              }`}
              title={cameraOn ? 'Camera off' : 'Camera on'}
            >
              {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            <button
              onClick={() => endCall(callId)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40 transition-all hover:scale-110 hover:bg-rose-600"
              title="End call"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
