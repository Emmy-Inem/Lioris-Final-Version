import { useEffect } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';

export interface LiveTable {
  table: string;
  /** PostgREST-style filter, e.g. `group_id=eq.<uuid>`. Row-level security still decides what is delivered. */
  filter?: string;
}

/**
 * Re-fetches the given queries whenever a watched table changes, so a shared space (mentorship, study pod)
 * updates while it is open. One channel per mounted screen, removed on unmount. Failing to connect is
 * harmless: callers also poll, so this is only a fast path.
 */
export function useLiveRefresh(channelName: string, tables: LiveTable[], queryKeys: QueryKey[], enabled = true) {
  const queryClient = useQueryClient();
  const tablesKey = JSON.stringify(tables);
  const keysKey = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Several rows can change in one action; refresh once per burst.
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        (JSON.parse(keysKey) as QueryKey[]).forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }, 250);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(channelName);
      for (const t of JSON.parse(tablesKey) as LiveTable[]) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, refresh);
      }
      channel.subscribe();
    } catch {
      // polling still covers us
    }
    return () => {
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel).catch(() => {});
    };
  }, [channelName, tablesKey, keysKey, enabled, queryClient]);
}
