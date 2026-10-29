import { lazyWeb } from '../lazyWeb';
import type { MentorshipSpace as MentorshipSpaceImpl } from './MentorshipSpace';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./MentorshipSpace.tsx.
export const MentorshipSpace = lazyWeb<typeof MentorshipSpaceImpl>(() => import('./MentorshipSpace.tsx').then((m) => m.MentorshipSpace), { screen: true });
