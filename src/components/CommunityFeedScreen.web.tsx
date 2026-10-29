import { lazyWeb } from './lazyWeb';
import type { CommunityFeedScreen as CommunityFeedScreenImpl } from './CommunityFeedScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./CommunityFeedScreen.tsx.
export const CommunityFeedScreen = lazyWeb<typeof CommunityFeedScreenImpl>(() => import('./CommunityFeedScreen.tsx').then((m) => m.CommunityFeedScreen), { screen: true });
