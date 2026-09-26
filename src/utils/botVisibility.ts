export const STORAGE_BOT_KEY = 'lioris.showBots';

export function isBotId(id?: string | null): boolean {
  if (!id) return false;
  return id.startsWith('00000000-0000-4000-a000-') || id.startsWith('00000000-0000-4000-b000-');
}
