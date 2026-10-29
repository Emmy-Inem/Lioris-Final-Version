import { lazyWeb } from './lazyWeb';
import type { ChangeWorkspaceScopeModal as ChangeWorkspaceScopeModalImpl } from './ChangeWorkspaceScopeModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ChangeWorkspaceScopeModal.tsx.
export const ChangeWorkspaceScopeModal = lazyWeb<typeof ChangeWorkspaceScopeModalImpl>(() => import('./ChangeWorkspaceScopeModal.tsx').then((m) => m.ChangeWorkspaceScopeModal), { open: (props) => Boolean(props.visible) });
