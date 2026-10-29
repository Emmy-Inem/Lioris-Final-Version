import { lazyWeb } from './lazyWeb';
import type { SettingsScreen as SettingsScreenImpl } from './SettingsScreenBase';

// Web only: loads the real implementation in its own chunk (see lazyWeb.tsx). Keep the exports identical to the
// ones of ./SettingsScreenBase.tsx.
export const SettingsScreen = lazyWeb<typeof SettingsScreenImpl>(() => import('./SettingsScreenBase.tsx').then((m) => m.SettingsScreen), { screen: true });
