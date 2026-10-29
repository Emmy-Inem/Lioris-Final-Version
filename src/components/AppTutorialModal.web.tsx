import { lazyWeb } from './lazyWeb';
import type { AppTutorialModal as AppTutorialModalImpl } from './AppTutorialModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./AppTutorialModal.tsx.
export const AppTutorialModal = lazyWeb<typeof AppTutorialModalImpl>(() => import('./AppTutorialModal.tsx').then((m) => m.AppTutorialModal));
