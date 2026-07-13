export function createVoiceSession() {
  return { phase: 'idle', mode: null };
}

export function transitionVoiceSession(session, event) {
  switch (event.type) {
    case 'start_requested':
      return { phase: 'requesting_permission', mode: event.mode };
    case 'started':
      return { phase: 'listening', mode: session.mode };
    case 'stop_requested':
      return { phase: 'stopping', mode: session.mode };
    case 'start_failed':
    case 'stopped':
      return { phase: 'idle', mode: null };
    case 'unavailable':
      return { phase: 'unavailable', mode: null };
    case 'destroyed':
      return { phase: 'destroyed', mode: null };
    default:
      return session;
  }
}

export function isVoiceActive(session) {
  return session.phase === 'listening' || session.phase === 'stopping';
}

export function isPttActive(session) {
  return session.mode === 'ptt' && isVoiceActive(session);
}
