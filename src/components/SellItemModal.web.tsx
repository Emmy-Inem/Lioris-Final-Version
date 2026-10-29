import { lazyWeb } from './lazyWeb';
import type { SellItemModal as SellItemModalImpl } from './SellItemModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./SellItemModal.tsx.
export const SellItemModal = lazyWeb<typeof SellItemModalImpl>(() => import('./SellItemModal.tsx').then((m) => m.SellItemModal), { open: (props) => Boolean(props.visible) });
