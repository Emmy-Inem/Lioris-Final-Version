import { lazyWeb } from './lazyWeb';
import type { ReportResourceForm as ReportResourceFormImpl, ReportResourceModal as ReportResourceModalImpl } from './ReportResourceModal';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./ReportResourceModal.tsx.
export const ReportResourceForm = lazyWeb<typeof ReportResourceFormImpl>(() => import('./ReportResourceModal.tsx').then((m) => m.ReportResourceForm));
export const ReportResourceModal = lazyWeb<typeof ReportResourceModalImpl>(() => import('./ReportResourceModal.tsx').then((m) => m.ReportResourceModal), { open: (props) => Boolean(props.visible) });
