import { lazyWeb } from './lazyWeb';
import type { ProfileScreen as ProfileScreenImpl } from './ProfileScreenBase';
export { PROFILE_ACADEMIC_LEVELS } from '@/constants/academicLevels';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ProfileScreenBase.tsx.
export const ProfileScreen = lazyWeb<typeof ProfileScreenImpl>(() => import('./ProfileScreenBase.tsx').then((m) => m.ProfileScreen), { screen: true });
