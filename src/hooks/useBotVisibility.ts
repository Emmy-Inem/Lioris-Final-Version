import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStoredValue, setStoredValue } from './useViewScope';
import { isBotId, STORAGE_BOT_KEY } from '../utils/botVisibility';

export const BOT_VISIBILITY_QUERY_KEY = ['bot-visibility'] as const;
export { isBotId };

export function useBotVisibility() {
  const queryClient = useQueryClient();

  const { data: showBots = true } = useQuery<boolean>({
    queryKey: BOT_VISIBILITY_QUERY_KEY,
    queryFn: async () => {
      const stored = await getStoredValue(STORAGE_BOT_KEY);
      if (stored === null) return true;
      return stored !== 'false';
    },
    staleTime: Infinity,
  });

  const setShowBots = (show: boolean) => {
    queryClient.setQueryData(BOT_VISIBILITY_QUERY_KEY, show);
    setStoredValue(STORAGE_BOT_KEY, String(show));
  };

  const toggleBotVisibility = () => {
    setShowBots(!showBots);
  };

  return {
    showBots,
    setShowBots,
    toggleBotVisibility,
    isBotId,
  };
}
