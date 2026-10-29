import { lazyWeb } from './lazyWeb';
import type { JobApplyModal as JobApplyModalImpl } from './JobApplyModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./JobApplyModal.tsx.
export const JobApplyModal = lazyWeb<typeof JobApplyModalImpl>(() => import('./JobApplyModal.tsx').then((m) => m.JobApplyModal), { open: (props) => Boolean(props.visible) });
