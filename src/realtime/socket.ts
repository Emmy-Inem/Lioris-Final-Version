import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { getAccessToken } from '@/auth/tokenStorage';

const { wsBaseUrl } = (Constants.expoConfig?.extra ?? {}) as { wsBaseUrl?: string };

export type RealtimeEvent =
  | { type: 'message.created'; conversationId: string; messageId: string }
  | { type: 'connection.updated'; connectionId: string; status: string }
  | { type: 'notification.created'; notificationId: string }
  | { type: 'rsvp.updated'; eventId: string; rsvpCount: number }
  | { type: 'moderation.updated'; reportId: string; status: string };

type Listener = (event: RealtimeEvent) => void;
type ConnectionStatusListener = (status: 'connecting' | 'open' | 'closed') => void;

/**
 * PRD Section 12.2: messaging/connection/notification updates ride a
 * real-time channel, and must "degrade gracefully to polling ... if the
 * socket connection fails." This client owns the reconnect policy;
 * consumers (useRealtimeChannel) own the polling fallback decision.
 */
class RealtimeSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<ConnectionStatusListener>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;

  async connect() {
    this.manuallyClosed = false;
    this.emitStatus('connecting');

    const token = await getAccessToken();
    if (!token || !wsBaseUrl) {
      this.emitStatus('closed');
      return;
    }

    try {
      this.ws = new WebSocket(`${wsBaseUrl}?token=${encodeURIComponent(token)}`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.emitStatus('open');
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as RealtimeEvent;
        this.listeners.forEach((listener) => listener(parsed));
      } catch {
        // Ignore malformed frames rather than crashing the socket handler.
      }
    };

    this.ws.onerror = () => {
      // onclose fires right after in most RN WebSocket implementations;
      // reconnect logic lives there to avoid double-scheduling.
    };

    this.ws.onclose = () => {
      this.emitStatus('closed');
      if (!this.manuallyClosed) this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delayMs = Math.min(30000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  disconnect() {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: ConnectionStatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(status: 'connecting' | 'open' | 'closed') {
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const realtimeSocket = new RealtimeSocket();
