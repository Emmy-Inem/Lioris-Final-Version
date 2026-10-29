import { lazyWeb } from './lazyWeb';
import type { ChatThread as ChatThreadImpl } from './ChatThread';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ChatThread.tsx.
export const ChatThread = lazyWeb<typeof ChatThreadImpl>(() => import('./ChatThread.tsx').then((m) => m.ChatThread), { screen: true });
