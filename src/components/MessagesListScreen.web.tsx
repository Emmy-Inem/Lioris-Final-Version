import { lazyWeb } from './lazyWeb';
import type { MessagesListScreen as MessagesListScreenImpl } from './MessagesListScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./MessagesListScreen.tsx.
export const MessagesListScreen = lazyWeb<typeof MessagesListScreenImpl>(() => import('./MessagesListScreen.tsx').then((m) => m.MessagesListScreen), { screen: true });
