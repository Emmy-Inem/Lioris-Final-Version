import { lazyWeb } from './lazyWeb';
import type { PublishThreadModal as PublishThreadModalImpl } from './PublishThreadModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./PublishThreadModal.tsx.
export const PublishThreadModal = lazyWeb<typeof PublishThreadModalImpl>(() => import('./PublishThreadModal.tsx').then((m) => m.PublishThreadModal), { open: (props) => Boolean(props.visible) });
