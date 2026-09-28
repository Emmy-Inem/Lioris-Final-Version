import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredValue, setStoredValue } from './useViewScope';
import { isBotId, isBotPost, isBotProfile, STORAGE_BOT_KEY, setMemoryBotVisibility } from '../utils/botVisibility';
import { useFeatureFlags } from '../context/FeatureFlagsContext';

export const BOT_VISIBILITY_QUERY_KEY = ['bot-visibility'] as const;
export { isBotId, isBotPost, isBotProfile };

export function useBotVisibility() {
  const queryClient = useQueryClient();
  const { isFeatureEnabled, setFeature } = useFeatureFlags();

  const isFlagOn = isFeatureEnabled('community_bots');

  const { data: storedShow = true } = useQuery<boolean>({
    queryKey: BOT_VISIBILITY_QUERY_KEY,
    queryFn: async () => {
      const stored = await getStoredValue(STORAGE_BOT_KEY);
      if (stored === null) return true;
      return stored !== 'false';
    },
    staleTime: Infinity,
  });

  // If the admin feature flag is disabled, showBots is unconditionally false!
  const showBots = isFlagOn && storedShow;

  useEffect(() => {
    setMemoryBotVisibility(showBots);
  }, [showBots]);

  const setShowBots = (show: boolean) => {
    setMemoryBotVisibility(show);
    queryClient.setQueryData(BOT_VISIBILITY_QUERY_KEY, show);
    setStoredValue(STORAGE_BOT_KEY, String(show));
    void setFeature('community_bots', show).catch(() => {});
  };

  const toggleBotVisibility = () => {
    setShowBots(!showBots);
  };

  return {
    showBots,
    setShowBots,
    toggleBotVisibility,
    isBotId,
    isBotPost,
    isBotProfile,
  };
}
