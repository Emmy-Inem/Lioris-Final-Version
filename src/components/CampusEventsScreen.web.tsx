import { lazyWeb } from './lazyWeb';
import type { CampusEventsScreen as CampusEventsScreenImpl } from './CampusEventsScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./CampusEventsScreen.tsx.
export const CampusEventsScreen = lazyWeb<typeof CampusEventsScreenImpl>(() => import('./CampusEventsScreen.tsx').then((m) => m.CampusEventsScreen), { screen: true });
