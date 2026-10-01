// Type-resolution shim only. Metro always prefers webrtc.web.ts (web builds) or
// webrtc.native.ts (iOS/Android builds) over this bare file, since platform-suffixed
// files take priority in its resolver - this file is never actually bundled. It exists
// solely so `tsc` (which has no concept of Metro's platform-extension resolution) has
// something to resolve `@/api/webrtc` to.
export * from './webrtc.web';
