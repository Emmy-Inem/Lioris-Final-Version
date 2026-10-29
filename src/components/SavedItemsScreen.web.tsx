import { lazyWeb } from './lazyWeb';
import type { SavedItemsScreen as SavedItemsScreenImpl } from './SavedItemsScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./SavedItemsScreen.tsx.
export const SavedItemsScreen = lazyWeb<typeof SavedItemsScreenImpl>(() => import('./SavedItemsScreen.tsx').then((m) => m.SavedItemsScreen), { screen: true });
