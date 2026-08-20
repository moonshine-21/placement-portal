import { memo } from 'react';

export type AIVisualState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'analyzing'
  | 'speaking'
  | 'interrupted'
  | 'success'
  | 'error'
  | 'offline';

const STATE_LABEL: Record<AIVisualState, string> = {
  idle: 'ONLINE',
  listening: 'LISTENING',
  thinking: 'THINKING',
  analyzing: 'ANALYZING',
  speaking: 'SPEAKING',
  interrupted: 'INTERRUPTED',
  success: 'READY',
  error: 'DEGRADED',
  offline: 'OFFLINE',
};

type Props = {
  state: AIVisualState;
  name?: string;
};

function AIPresenceInner({ state, name = 'Aether' }: Props) {
  return (
    <div className={`aether-presence aether-${state}`} aria-live="polite">
      <div className="aether-ring aether-ring-outer" />
      <div className="aether-ring aether-ring-mid" />
      <div className="aether-core">
        <div className="aether-core-inner" />
      </div>
      <div className="aether-meta">
        <span className="aether-name">{name}</span>
        <span className="aether-state">{STATE_LABEL[state]}</span>
      </div>
    </div>
  );
}

export const AIPresence = memo(AIPresenceInner);
