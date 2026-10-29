import { lazyWeb } from './lazyWeb';
import type { ResourceReaderModal as ResourceReaderModalImpl } from './ResourceReaderModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ResourceReaderModal.tsx.
export const ResourceReaderModal = lazyWeb<typeof ResourceReaderModalImpl>(() => import('./ResourceReaderModal.tsx').then((m) => m.ResourceReaderModal), { open: (props) => Boolean(props.visible) });
