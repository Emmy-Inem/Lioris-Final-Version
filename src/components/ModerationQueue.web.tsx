import { lazyWeb } from './lazyWeb';
import type { ModerationQueue as ModerationQueueImpl } from './ModerationQueue';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ModerationQueue.tsx.
export const ModerationQueue = lazyWeb<typeof ModerationQueueImpl>(() => import('./ModerationQueue.tsx').then((m) => m.ModerationQueue), { screen: true });
