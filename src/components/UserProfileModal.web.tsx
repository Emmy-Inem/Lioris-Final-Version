import { lazyWeb } from './lazyWeb';
import type { UserProfileModal as UserProfileModalImpl } from './UserProfileModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./UserProfileModal.tsx.
export const UserProfileModal = lazyWeb<typeof UserProfileModalImpl>(() => import('./UserProfileModal.tsx').then((m) => m.UserProfileModal), { open: (props) => Boolean(props.visible) });
