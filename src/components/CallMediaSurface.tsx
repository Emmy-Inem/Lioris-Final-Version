// Type-resolution shim only - see src/api/webrtc.ts for why this exists. Metro always
// prefers CallMediaSurface.web.tsx (web builds) or CallMediaSurface.native.tsx
// (iOS/Android builds) over this bare file.
export * from './CallMediaSurface.web';
