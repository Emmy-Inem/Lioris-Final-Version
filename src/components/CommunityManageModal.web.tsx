import { lazyWeb } from './lazyWeb';
import type { CommunityManageModal as CommunityManageModalImpl } from './CommunityManageModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./CommunityManageModal.tsx.
export const CommunityManageModal = lazyWeb<typeof CommunityManageModalImpl>(() => import('./CommunityManageModal.tsx').then((m) => m.CommunityManageModal), { open: (props) => Boolean(props.visible) });
