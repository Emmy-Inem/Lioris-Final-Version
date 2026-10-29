import { lazyWeb } from './lazyWeb';
import type { EventDetailScreen as EventDetailScreenImpl } from './EventDetailScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./EventDetailScreen.tsx.
export const EventDetailScreen = lazyWeb<typeof EventDetailScreenImpl>(() => import('./EventDetailScreen.tsx').then((m) => m.EventDetailScreen), { screen: true });
