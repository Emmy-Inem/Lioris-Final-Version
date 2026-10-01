export interface CallMediaSurfaceProps {
  kind: 'local' | 'remote';
  stream: any;
  isVideo: boolean;
  mirrored?: boolean;
  style?: any;
}
