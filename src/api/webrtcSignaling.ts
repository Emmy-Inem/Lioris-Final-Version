/** Platform-agnostic half of the calling engine: ICE/TURN server resolution and signaling-payload
 * validation. Shared by src/api/webrtc.web.ts and src/api/webrtc.native.ts so the two platform
 * implementations can't drift on how they vet messages coming off the Supabase Realtime channel.
 */
import { supabase } from '@/api/supabase';

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];

// ---------------------------------------------------------------------------
// TURN relay. Public STUN alone fails behind symmetric NAT / carrier-grade NAT
// (very common on mobile networks), so the 'turn-credentials' edge function
// mints short-lived Cloudflare TURN credentials. They are cached in memory and
// any failure (not configured, offline, timeout, rate limited) falls back to
// STUN-only so a call can still start.
// ---------------------------------------------------------------------------
const TURN_FETCH_TIMEOUT_MS = 3000;
const TURN_DEFAULT_TTL_SECONDS = 3600;
const TURN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedIceServers {
  servers: any[];
  expiresAt: number;
}

let cachedTurnServers: CachedIceServers | null = null;
let inflightTurnFetch: Promise<any[]> | null = null;

async function fetchTurnServers(): Promise<any[]> {
  const invoke = supabase.functions.invoke('turn-credentials', { body: {} });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('turn-credentials timeout')), TURN_FETCH_TIMEOUT_MS);
  });
  try {
    const { data, error } = (await Promise.race([invoke, timeout])) as {
      data: { iceServers?: unknown; ttl?: unknown } | null;
      error: unknown;
    };
    if (error || !data || !Array.isArray(data.iceServers)) return [];
    const servers = data.iceServers.filter(
      (s: any) => s && (typeof s.urls === 'string' || Array.isArray(s.urls)),
    );
    if (servers.length === 0) return [];
    const ttl = typeof data.ttl === 'number' && data.ttl > 0 ? data.ttl : TURN_DEFAULT_TTL_SECONDS;
    cachedTurnServers = {
      servers,
      expiresAt: Date.now() + ttl * 1000 - TURN_REFRESH_MARGIN_MS,
    };
    return servers;
  } catch {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** STUN list plus (when available) TURN relay servers. Never throws. */
export async function getIceServers(): Promise<any[]> {
  try {
    if (cachedTurnServers && cachedTurnServers.expiresAt > Date.now()) {
      return [...cachedTurnServers.servers, ...ICE_SERVERS];
    }
    if (!inflightTurnFetch) {
      inflightTurnFetch = fetchTurnServers().finally(() => {
        inflightTurnFetch = null;
      });
    }
    const turn = await inflightTurnFetch;
    return [...turn, ...ICE_SERVERS];
  } catch {
    return ICE_SERVERS;
  }
}

// Signaling payloads arrive from other clients over Realtime broadcast, so they
// are validated before touching the peer connection.
export function isValidSenderId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isValidSessionDescription(value: unknown, type: 'offer' | 'answer'): value is { type: string; sdp: string } {
  if (!value || typeof value !== 'object') return false;
  const v = value as { type?: unknown; sdp?: unknown };
  return v.type === type && typeof v.sdp === 'string' && v.sdp.length > 0 && v.sdp.length <= 200_000;
}

export function isValidIceCandidate(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown };
  return (
    typeof v.candidate === 'string' &&
    v.candidate.length <= 4096 &&
    (v.sdpMid == null || typeof v.sdpMid === 'string') &&
    (v.sdpMLineIndex == null || typeof v.sdpMLineIndex === 'number')
  );
}

/** Signaling channel name is derived identically on both platforms. */
export function signalingChannelName(roomName: string): string {
  return `webrtc:${roomName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}
