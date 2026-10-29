import { lazyWeb } from './lazyWeb';
import type { PostDetailScreen as PostDetailScreenImpl } from './PostDetailScreen';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./PostDetailScreen.tsx.
export const PostDetailScreen = lazyWeb<typeof PostDetailScreenImpl>(() => import('./PostDetailScreen.tsx').then((m) => m.PostDetailScreen), { screen: true });
