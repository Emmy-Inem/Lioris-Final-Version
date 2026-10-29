import { lazyWeb } from './lazyWeb';
import type { SearchScreen as SearchScreenImpl } from './SearchScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./SearchScreen.tsx.
export const SearchScreen = lazyWeb<typeof SearchScreenImpl>(() => import('./SearchScreen.tsx').then((m) => m.SearchScreen), { screen: true });
