import { lazyWeb } from '../lazyWeb';
import type { ManagePortalLinksModal as ManagePortalLinksModalImpl } from './ManagePortalLinksModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ManagePortalLinksModal.tsx.
export const ManagePortalLinksModal = lazyWeb<typeof ManagePortalLinksModalImpl>(() => import('./ManagePortalLinksModal.tsx').then((m) => m.ManagePortalLinksModal), { open: (props) => Boolean(props.visible) });
