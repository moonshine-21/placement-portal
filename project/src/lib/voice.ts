// Voice layer: browser STT + TTS with interrupt support.

export type VoiceHandlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (err: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
};

function getRecognition(): any | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = 'en-US';
  return rec;
}

export function isSpeechRecognitionSupported() {
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export class VoiceSession {
  private rec: any | null = null;
  private speaking = false;

  startListening(handlers: VoiceHandlers) {
    this.stopSpeaking();
    const rec = getRecognition();
    if (!rec) {
      handlers.onError?.('Speech recognition is not supported in this browser. Use text instead.');
      return;
    }
    this.rec = rec;
    rec.onstart = () => handlers.onStart?.();
    rec.onerror = (e: any) => handlers.onError?.(e?.error || 'mic-error');
    rec.onend = () => handlers.onEnd?.();
    rec.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (interim) handlers.onPartial?.(interim);
      if (finalText) handlers.onFinal?.(finalText.trim());
    };
    try {
      rec.start();
    } catch {
      handlers.onError?.('Could not start microphone.');
    }
  }

  stopListening() {
    try { this.rec?.stop?.(); } catch { /* ignore */ }
    this.rec = null;
  }

  speak(text: string, onEnd?: () => void) {
    if (!isSpeechSynthesisSupported()) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    u.onend = () => {
      this.speaking = false;
      onEnd?.();
    };
    u.onerror = () => {
      this.speaking = false;
      onEnd?.();
    };
    this.speaking = true;
    window.speechSynthesis.speak(u);
  }

  stopSpeaking() {
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
    this.speaking = false;
  }

  isSpeaking() {
    return this.speaking;
  }
}
