import { lazyWeb } from '../lazyWeb';
import type { EventDoorDesk as EventDoorDeskImpl } from './EventDoorDesk';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./EventDoorDesk.tsx.
export const EventDoorDesk = lazyWeb<typeof EventDoorDeskImpl>(() => import('./EventDoorDesk.tsx').then((m) => m.EventDoorDesk), { open: (props) => Boolean(props.visible) });
