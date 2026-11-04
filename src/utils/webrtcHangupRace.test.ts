import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// The call engine imports react-native-era modules through the `@/` alias. A resolve hook maps `@/api/supabase` to
// a fake and every other `@/...` to the real file so the REAL WebRTCCallSession (web) can run under node --test.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const hookSource = `
import { pathToFileURL } from 'node:url';
import path from 'node:path';
let root = '';
export async function initialize(data) { root = data.root; }
export async function resolve(specifier, context, next) {
  if (specifier === '@/api/supabase') {
    return { url: 'data:text/javascript,export const supabase = globalThis.__fakeSupabase;', shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    return next(pathToFileURL(path.join(root, 'src', specifier.slice(2) + '.ts')).href, context);
  }
  return next(specifier, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(hookSource), { parentURL: import.meta.url, data: { root } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('hanging up while the microphone prompt is open releases the stream granted afterwards', async () => {
  const stopped: string[] = [];
  const track = { kind: 'audio', enabled: true, stop: () => stopped.push('audio') };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] };
  const media = deferred<typeof stream>();

  let peerConnections = 0;
  let channelsCreated = 0;
  (globalThis as any).__DEV__ = false;
  (globalThis as any).__fakeSupabase = {
    functions: { invoke: async () => ({ data: null, error: new Error('no turn') }) },
    channel: () => {
      channelsCreated += 1;
      throw new Error('a hung-up session must not open a signalling channel');
    },
    removeChannel: () => {},
  };
  (globalThis as any).window = {
    RTCPeerConnection: class {
      constructor() {
        peerConnections += 1;
      }
      addTrack() {}
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: () => media.promise } },
    configurable: true,
    writable: true,
  });

  const { WebRTCCallSession } = await import(pathToFileURL(path.join(root, 'src/api/webrtc.web.ts')).href);
  const states: string[] = [];
  const session = new WebRTCCallSession({
    roomName: 'room-1',
    userId: 'u1',
    userName: 'Ada',
    isVideo: false,
    onConnectionStateChange: (s: string) => states.push(s),
    onError: () => {},
  });

  const started = session.start();
  await new Promise((r) => setTimeout(r, 5));
  session.hangup(); // the user cancels while the browser is still asking for the microphone
  media.resolve(stream); // ...then the permission is granted
  await started;

  assert.deepEqual(stopped, ['audio'], 'the microphone granted after hangup must be released');
  assert.equal(peerConnections, 0, 'no peer connection may be created after hangup');
  assert.equal(channelsCreated, 0, 'no signalling channel may be opened after hangup');
});
