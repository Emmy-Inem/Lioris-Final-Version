export const STORAGE_BOT_KEY = 'lioris.showBots';

let memoryBotVisibility: boolean | null = null;

export function setMemoryBotVisibility(enabled: boolean) {
  memoryBotVisibility = enabled;
}

export function isBotVisibilityEnabled(): boolean {
  if (memoryBotVisibility !== null) return memoryBotVisibility;
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_BOT_KEY);
      if (stored !== null) return stored !== 'false';
      const flags = localStorage.getItem('lioris_feature_flags');
      if (flags) {
        const parsed = JSON.parse(flags);
        if (parsed.community_bots === false) return false;
      }
    } catch {}
  }
  return true;
}

export function isBotId(id?: string | null): boolean {
  if (!id) return false;
  return id.startsWith('00000000-0000-4000-a000-') || id.startsWith('00000000-0000-4000-b000-');
}

export function isBotProfile(profile?: any): boolean {
  if (!profile) return false;
  if (profile.is_bot === true || profile.isBot === true) return true;
  if (isBotId(profile.id)) return true;
  return false;
}

export function isBotPost(post?: any): boolean {
  if (!post) return false;
  if (isBotId(post.id)) return true;
  if (isBotId(post.authorId || post.author_id)) return true;
  if (post.isBot === true || post.is_bot === true) return true;
  if (isBotProfile(post.author || post.profiles)) return true;
  return false;
}

