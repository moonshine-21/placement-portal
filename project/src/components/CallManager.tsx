import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User as UserIcon } from 'lucide-react';
import type { Call, Profile } from '@/lib/supabase';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const RING_TIMEOUT = 45000;
const CONNECT_TIMEOUT = 15000;

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

  const rtcPeerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
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
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const cleanup = () => {
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach((t) => t.stop()); localStreamRef.current = null; }
    if (rtcPeerRef.current) { try { rtcPeerRef.current.close(); } catch { /* */ } rtcPeerRef.current = null; }
    if (signalChannelRef.current) { try { supabase.removeChannel(signalChannelRef.current); } catch { /* */ } signalChannelRef.current = null; }
    if (statusChannelRef.current) { try { supabase.removeChannel(statusChannelRef.current); } catch { /* */ } statusChannelRef.current = null; }
    if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    offerSentRef.current = false; answerReceivedRef.current = false; pendingIceRef.current = [];
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const endCall = async (id: string | null) => {
    if (id) {
      try {
        await supabase.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', id);
      } catch { /* ignore */ }
    }
    if (signalChannelRef.current) {
      try {
        signalChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'bye', from: user?.id } });
      } catch { /* ignore */ }
    }
    cleanup();
    setState('idle'); setCallId(null); setCallerInfo(null); setCalleeInfo(null);
    activeCallIdRef.current = null; incomingCallIdRef.current = null;
  };

  const getIceServers = async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch('/api/turn-credentials', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.iceServers) && data.iceServers.length) return [...FALLBACK_ICE_SERVERS, ...data.iceServers];
      }
    } catch { /* ignore */ }
    return FALLBACK_ICE_SERVERS;
  };

  const prepareCall = async (id: string, isCaller: boolean, otherProfile?: { name: string; avatar: string }) => {
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      try {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setCameraOn(false);
      } catch {
        // no media available
      }
    }
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;

    const iceServers = await getIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    rtcPeerRef.current = peer;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
    }

    peer.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };
    peer.onconnectionstatechange = () => {
      const cs = peer.connectionState;
      if (cs === 'connected') { setCallStatus('In call'); if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; } }
      else if (cs === 'failed') { endCall(id); }
      else if (cs === 'disconnected') { setCallStatus('Reconnecting…'); }
    };
    peer.onicecandidate = (e) => {
      if (e.candidate && signalChannelRef.current) {
        signalChannelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ice-candidate', from: user?.id, candidate: e.candidate } });
      }
    };

    const channel = supabase.channel(`call-${id}`, { config: { presence: { key: user?.id || 'anon' }, private: true } });
    signalChannelRef.current = channel;

    channel.on('broadcast', { event: 'signal' }, async (msg: any) => {
      const payload = msg.payload;
      if (payload.from === user?.id) return;
      if (payload.kind === 'ready') {
        if (isCaller && !offerSentRef.current && rtcPeerRef.current) await sendOffer(id);
      } else if (payload.kind === 'offer') {
        if (!isCaller && rtcPeerRef.current) {
          await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          flushPendingIce();
          const answer = await rtcPeerRef.current.createAnswer();
          await rtcPeerRef.current.setLocalDescription(answer);
          channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'answer', from: user?.id, sdp: answer } });
        }
      } else if (payload.kind === 'answer') {
        if (isCaller && rtcPeerRef.current && !answerReceivedRef.current) {
          answerReceivedRef.current = true;
          await rtcPeerRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          flushPendingIce();
        }
      } else if (payload.kind === 'ice-candidate') {
        if (rtcPeerRef.current) {
          if (rtcPeerRef.current.remoteDescription) {
            try { await rtcPeerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch { /* */ }
          } else {
            pendingIceRef.current.push(new RTCIceCandidate(payload.candidate));
          }
        }
      } else if (payload.kind === 'bye') {
        cleanup(); setState('idle'); setCallId(null);
      }
    });

    channel.on('presence', { event: 'sync' }, async () => {
      if (isCaller && !offerSentRef.current && rtcPeerRef.current) {
        const others = Object.keys(channel.presenceState()).filter((k) => k !== user?.id);
        if (others.length > 0) await sendOffer(id);
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: new Date().toISOString() });
        if (!isCaller) {
          for (let i = 0; i < 2; i++) {
            channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ready', from: user?.id } });
            if (i === 0) await new Promise((r) => setTimeout(r, 300));
          }
        }
      }
    });

    subscribeCallStatus(id, isCaller);
    connectTimerRef.current = setTimeout(() => { if (peer.connectionState !== 'connected') endCall(id); }, CONNECT_TIMEOUT);
  };

  const flushPendingIce = async () => {
    while (pendingIceRef.current.length) {
      const c = pendingIceRef.current.shift()!;
      try { await rtcPeerRef.current?.addIceCandidate(c); } catch { /* */ }
    }
  };

  const sendOffer = async (id: string) => {
    if (!rtcPeerRef.current || offerSentRef.current) return;
    offerSentRef.current = true;
    const offer = await rtcPeerRef.current.createOffer();
    await rtcPeerRef.current.setLocalDescription(offer);
    signalChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { kind: 'offer', from: user?.id, sdp: offer } });
  };

  const subscribeCallStatus = (id: string, isCaller: boolean) => {
    const ch = supabase.channel(`call-status-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${id}` }, (payload: any) => {
        const st = payload.new?.status;
        if (st === 'accepted' && isCaller) { setState('active'); setCallStatus('Connecting…'); }
        else if (st === 'declined' && isCaller) { cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null; }
        else if (st === 'ended' || st === 'missed') { cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null; }
      })
      .subscribe();
    statusChannelRef.current = ch;
  };

  // Start outgoing call
  useEffect(() => {
    if (startCallRequest && user) {
      (async () => {
        const { data: callee } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', startCallRequest.calleeId).maybeSingle();
        const cp = callee as Profile | null;
        const roomName = 'call-' + Math.random().toString(36).slice(2, 12);
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
        ringTimerRef.current = setTimeout(() => {
          if (activeCallIdRef.current === call.id) {
            supabase.from('calls').update({ status: 'missed', updated_at: new Date().toISOString() }).eq('id', call.id).eq('status', 'ringing').then(() => {
              cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null;
            });
          }
        }, RING_TIMEOUT);
        await prepareCall(call.id, true);
        onCallConsumed();
      })();
    }
  }, [startCallRequest, user]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('calls-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${user.id}` }, async (payload: any) => {
        if (payload.new?.status === 'ringing' && state === 'idle') {
          const call = payload.new as Call;
          incomingCallIdRef.current = call.id;
          activeCallIdRef.current = call.id;
          setCallId(call.id);
          const { data: caller } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', call.caller_id).maybeSingle();
          const cp = caller as Profile | null;
          setCallerInfo({ id: call.caller_id, name: cp?.full_name || 'Someone', avatar: cp?.avatar_url || '', callType: call.call_type });
          setState('incoming');
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

  const acceptCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    await supabase.from('calls').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', callId);
    setState('active'); setCallStatus('Connecting…');
    await prepareCall(callId, false);
  };

  const declineCall = async () => {
    if (!callId) return;
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    await supabase.from('calls').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', callId);
    cleanup(); setState('idle'); setCallId(null); incomingCallIdRef.current = null; activeCallIdRef.current = null;
  };

  const cancelOutgoing = async () => {
    if (ringTimerRef.current) { clearTimeout(ringTimerRef.current); ringTimerRef.current = null; }
    if (callId) await supabase.from('calls').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', callId);
    cleanup(); setState('idle'); setCallId(null); activeCallIdRef.current = null;
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setCameraOn(track.enabled); }
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled); }
  };

  if (state === 'idle') return null;

  const Avatar = ({ name, url, size = 64 }: { name: string; url: string; size?: number }) =>
    url ? <img src={url} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" /> : (
      <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xl font-bold text-white">{name.slice(0, 2).toUpperCase()}</div>
    );

  return (
    <>
      {/* Incoming call modal */}
      {state === 'incoming' && callerInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="glass flex flex-col items-center gap-4 p-8 animate-fade-in-scale">
            <Avatar name={callerInfo.name} url={callerInfo.avatar} size={80} />
            <h2 className="text-xl font-bold">{callerInfo.name}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{callerInfo.callType === 'interview' ? 'Interview call' : 'is calling…'}</p>
            <div className="flex gap-4 mt-2">
              <button onClick={acceptCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all hover:scale-110 animate-[pulse-ring_2s_infinite]"><Phone size={24} /></button>
              <button onClick={declineCall} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-all hover:scale-110"><PhoneOff size={24} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing call modal */}
      {state === 'outgoing' && calleeInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="glass flex flex-col items-center gap-4 p-8 animate-fade-in-scale">
            <Avatar name={calleeInfo.name} url={calleeInfo.avatar} size={80} />
            <h2 className="text-xl font-bold">{calleeInfo.name}</h2>
            <p className="text-sm text-[var(--text-secondary)]">{callStatus}</p>
            <button onClick={cancelOutgoing} className="mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-all hover:scale-110"><PhoneOff size={24} /></button>
          </div>
        </div>
      )}

      {/* Active call overlay */}
      {state === 'active' && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /></div>
              <span className="text-sm font-medium text-white">{callStatus}</span>
            </div>
          </div>
          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <div className="absolute bottom-4 right-4 h-32 w-44 overflow-hidden rounded-xl border-2 border-white/20 bg-black">
              <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ display: cameraOn ? 'block' : 'none' }} />
              {!cameraOn && <div className="flex h-full items-center justify-center text-white/50 text-xs">Camera off</div>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 py-6">
            <button onClick={toggleMic} className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 ${micOn ? 'bg-white/10 text-white' : 'bg-white text-black'}`} title={micOn ? 'Mute' : 'Unmute'}>
              {micOn ? <Mic size={22} /> : <MicOff size={22} />}
            </button>
            <button onClick={toggleCamera} className={`flex h-14 w-14 items-center justify-center rounded-full transition-all hover:scale-110 ${cameraOn ? 'bg-white/10 text-white' : 'bg-white text-black'}`} title={cameraOn ? 'Camera off' : 'Camera on'}>
              {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
            </button>
            <button onClick={() => endCall(callId)} className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-all hover:scale-110" title="End call">
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
