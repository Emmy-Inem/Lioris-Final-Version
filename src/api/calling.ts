import { sendMessage } from './messaging';
import { isSafeHttpUrl } from '../utils/safeUrl';

export interface CallDetails {
  callType: 'voice' | 'video';
  roomName: string;
  callUrl: string;
  callerName?: string;
}

/**
 * Generates a clean, deterministic room name for a given conversation or meeting.
 */
export function getCallRoomName(conversationId: string): string {
  const clean = conversationId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  return `lioris-ui-${clean || 'campus-room'}`;
}

/**
 * Builds the live internet WebRTC URL powered by Jitsi Meet Cloud API.
 * Configured for instant two-way audio/video with no pre-join hurdles.
 */
export function getCallUrl(roomName: string, isVoiceOnly: boolean = false): string {
  const baseUrl = `https://meet.jit.si/${roomName}`;
  const config = [
    `config.startWithVideoMuted=${isVoiceOnly}`,
    `config.startWithAudioMuted=false`,
    `config.prejoinPageEnabled=false`,
    `config.disableDeepLinking=true`,
    `config.disableThirdPartyRequests=true`,
    `config.requireDisplayName=false`,
    `config.toolbarButtons=['microphone','camera','desktop','hangup','chat','settings','raisehand','tileview']`,
  ].join('&');

  return `${baseUrl}#${config}`;
}

/**
 * Posts a real-time call invitation into the active chat channel so the
 * other user receives an instant notification and join button.
 */
export async function startCallInChat(
  conversationId: string,
  callType: 'voice' | 'video',
  callerName: string,
): Promise<CallDetails> {
  const roomName = getCallRoomName(conversationId);
  const callUrl = getCallUrl(roomName, callType === 'voice');
  const emoji = callType === 'voice' ? '📞' : '📹';
  const label = callType === 'voice' ? 'Voice Call' : 'Video Call';

  const content = `${emoji} [CALL_INVITE]
${callerName} started a campus ${label}.
Room: ${roomName}
Link: ${callUrl}`;

  try {
    await sendMessage(conversationId, content);
  } catch (err) {
    console.warn('[Calling] Could not post call invitation message:', err);
  }

  return { callType, roomName, callUrl, callerName };
}

/**
 * Checks if a chat message is a live call invite.
 */
export function isCallMessage(content: string): boolean {
  return content.includes('[CALL_INVITE]') || content.includes('meet.jit.si');
}

/**
 * Parses call details from a call message content.
 */
export function extractCallDetails(content: string): CallDetails | null {
  if (!isCallMessage(content)) return null;

  const isVoice = content.includes('Voice') || content.includes('📞');
  const callType: 'voice' | 'video' = isVoice ? 'voice' : 'video';

  const roomMatch = content.match(/Room:\s*([^\s\n]+)/);
  const linkMatch = content.match(/Link:\s*([^\s\n]+)/);

  let callUrl = linkMatch ? linkMatch[1] : '';
  let roomName = roomMatch ? roomMatch[1] : '';

  // Message text is attacker-controlled: only accept a plain room slug and a safe http(s) link.
  if (roomName && !/^[A-Za-z0-9_-]{1,64}$/.test(roomName)) roomName = '';
  if (callUrl && !isSafeHttpUrl(callUrl)) callUrl = '';

  if (!roomName && callUrl) {
    const urlParts = callUrl.split('#')[0].split('/');
    roomName = urlParts[urlParts.length - 1] || 'campus-call';
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomName)) roomName = 'campus-call';
  } else if (!roomName) {
    roomName = 'campus-call';
  }

  if (!callUrl) {
    callUrl = getCallUrl(roomName, callType === 'voice');
  }

  return {
    callType,
    roomName,
    callUrl,
  };
}
