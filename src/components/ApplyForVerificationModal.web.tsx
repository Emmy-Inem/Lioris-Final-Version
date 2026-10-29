import { lazyWeb } from './lazyWeb';
import type { ApplyForVerificationModal as ApplyForVerificationModalImpl } from './ApplyForVerificationModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ApplyForVerificationModal.tsx.
export const ApplyForVerificationModal = lazyWeb<typeof ApplyForVerificationModalImpl>(() => import('./ApplyForVerificationModal.tsx').then((m) => m.ApplyForVerificationModal), { open: (props) => Boolean(props.visible) });
