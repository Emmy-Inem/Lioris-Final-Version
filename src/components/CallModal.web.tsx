import { lazyWeb } from './lazyWeb';
import type { CallModal as CallModalImpl } from './CallModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./CallModal.tsx.
export const CallModal = lazyWeb<typeof CallModalImpl>(() => import('./CallModal.tsx').then((m) => m.CallModal), { open: (props) => Boolean(props.visible) });
