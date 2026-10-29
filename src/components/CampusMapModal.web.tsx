import { lazyWeb } from './lazyWeb';
import type { CampusMapModal as CampusMapModalImpl } from './CampusMapModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./CampusMapModal.tsx.
export const CampusMapModal = lazyWeb<typeof CampusMapModalImpl>(() => import('./CampusMapModal.tsx').then((m) => m.CampusMapModal), { open: (props) => Boolean(props.visible) });
