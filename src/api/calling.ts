import { sendMessage } from './messaging';
import { createNotification } from './notifications';
import { isUserBlocked } from './connections';

export interface CallDetails {
  callType: 'voice' | 'video';
  roomName: string;
  callUrl: string;
  callerName?: string;
}

/** Marks a chat message as a courtesy "call declined" follow-up (see IncomingCallListener). */
export const CALL_DECLINED_MARKER = '[CALL_DECLINED]';

/**
 * Generates a clean, deterministic room name for a given conversation or meeting.
 */
export function getCallRoomName(conversationId: string): string {
  const clean = conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `lioris-ui-${clean || 'campus-room'}`;
}

/**
 * Historically built a public Jitsi Meet URL and handed it out as a
 * "share/copy link" - even though calls actually run on native WebRTC,
 * signalled over a private Supabase Realtime channel (src/api/webrtc.ts).
 * Jitsi was never part of the real call, so that link silently sent anyone
 * who opened it into an unrelated public Jitsi room instead of this one.
 *
 * There is no safe drop-in replacement: joining this call requires a signed-in
 * Lioris session and this exact conversation's context, which a plain
 * shareable URL can't carry without routing/auth-redirect wiring this pass
 * can't verify end-to-end. Kept (returning an empty string) only so existing
 * callers - this file and src/components/mentorship/MentorshipSpace.tsx -
 * keep compiling; nothing renders it as a link any more. `CallModal`'s
 * "Share" action now copies plain honest instructions instead.
 */
export function getCallUrl(_roomName: string, _isVoiceOnly: boolean = false): string {
  return '';
}

/**
 * Posts a real-time call invitation into the active chat channel so the
 * other user receives an instant notification and join button, and creates a
 * `notifications` row (push + in-app badge) so it reaches them even if
 * they're not already looking at this chat - see IncomingCallListener for
 * the foregrounded/backgrounded realtime pickup of that invite.
 *
 * Blocks the attempt when the caller has blocked `recipientId` (muting is
 * deliberately not threaded into messaging/calling - see user_mutes in
 * supabase/migrations/20261004000000_discovery_and_polish.sql).
 */
export async function startCallInChat(
  conversationId: string,
  callType: 'voice' | 'video',
  callerName: string,
  recipientId?: string,
): Promise<CallDetails> {
  if (recipientId && isUserBlocked(recipientId)) {
    throw new Error("You can't call a user you've blocked.");
  }

  const roomName = getCallRoomName(conversationId);
  const callUrl = getCallUrl(roomName, callType === 'voice');
  const emoji = callType === 'voice' ? '📞' : '📹';
  const label = callType === 'voice' ? 'Voice Call' : 'Video Call';

  const content = `${emoji} [CALL_INVITE]
${callerName} started a campus ${label}.
Room: ${roomName}`;

  try {
    await sendMessage(conversationId, content);
  } catch (err) {
    console.warn('[Calling] Could not post call invitation message:', err);
  }

  if (recipientId) {
    // Fire-and-forget, like every other createNotification call site -
    // it never throws, so a failed notification can't sink a started call.
    createNotification({
      recipientId,
      type: 'message',
      title: `Incoming ${label}`,
      body: `${callerName} is calling you - tap to join.`,
      deepLinkPath: `/(student)/messages/${conversationId}`,
    });
  }

  return { callType, roomName, callUrl, callerName };
}

/**
 * Checks if a chat message is a live call invite.
 */
export function isCallMessage(content: string): boolean {
  return content.includes('[CALL_INVITE]');
}

/**
 * Parses call details from a call message content.
 */
export function extractCallDetails(content: string): CallDetails | null {
  if (!isCallMessage(content)) return null;

  const isVoice = content.includes('Voice') || content.includes('📞');
  const callType: 'voice' | 'video' = isVoice ? 'voice' : 'video';

  const roomMatch = content.match(/Room:\s*([^\s\n]+)/);
  let roomName = roomMatch ? roomMatch[1] : '';

  // Message text is attacker-controlled: only accept a plain room slug.
  if (roomName && !/^[A-Za-z0-9_-]{1,64}$/.test(roomName)) roomName = '';
  if (!roomName) roomName = 'campus-call';

  return {
    callType,
    roomName,
    callUrl: getCallUrl(roomName, callType === 'voice'),
  };
}
