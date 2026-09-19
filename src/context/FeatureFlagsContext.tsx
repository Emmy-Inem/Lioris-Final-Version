import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';import { Platform } from 'react-native';import * as SecureStore from 'expo-secure-store';import { supabase } from '@/api/supabase';
import { recordAuditLogEntry } from '@/api/auditLog';

// 'xp_gamification', 'stories_bar' and 'ai_copilot' were removed along with
// the widgets they gated. All three rendered hardcoded content (a fixed XP
// streak and rank, four invented campus stories, canned "AI" answers behind a
// simulated delay) with no backing tables or service, so they were deleted
// rather than left as flagged-off placeholders.
export type FeatureKey =
  | 'career_page'
  | 'marketplace'
  | 'utility_cards'
  | 'study_groups'
  | 'campus_events'
  | 'academic_resources'
  | 'alumni_mentorship'
  | 'discussion_workspaces'
  | 'e2ee_messaging'
  | 'live_weather'
  | 'global_library'
  | 'campus_radio'
  | 'campus_map'
  | 'ai_study_copilot'
  | 'currency_converter'
  | 'forum_trends'
  | 'alumni_network'
  | 'campus_announcements';

export interface FeatureFlagMeta {
  key: FeatureKey;
  label: string;
  category: 'Engagement & XP' | 'Commerce & Career' | 'Campus Life' | 'AI & Tools';
  tier: 'P0' | 'P1' | 'P2';
  description: string;
  defaultOn: boolean;
}

export const FEATURE_CATALOG: FeatureFlagMeta[] = [
  {
    key: 'career_page',
    label: 'Career & Job Opportunities',
    category: 'Commerce & Career',
    tier: 'P1',
    description: 'Enables student internships, graduate recruitment, and alumni job postings.',
    defaultOn: true,
  },
  {
    key: 'marketplace',
    label: 'Campus Marketplace & Trade',
    category: 'Commerce & Career',
    tier: 'P1',
    description: 'Allows students to buy and sell textbooks, electronics, dorm essentials, and academic kits.',
    defaultOn: true,
  },
  {
    key: 'utility_cards',
    label: 'Campus Calendar, Timetable & Utility Cards',
    category: 'Campus Life',
    tier: 'P1',
    description: 'Shows lecture countdowns, timetable shortcuts, and university portal tiles.',
    defaultOn: true,
  },
  {
    key: 'study_groups',
    label: 'Live Study Squads & Hubs',
    category: 'Campus Life',
    tier: 'P1',
    description: 'Enables Senate E-Library check-ins, study circles, and peer revision squad activity.',
    defaultOn: true,
  },
  {
    key: 'campus_events',
    label: 'Events Hub & Campus RSVPs',
    category: 'Campus Life',
    tier: 'P0',
    description: 'Highlights university symposiums, hackathons, seminars, and calendar sync.',
    defaultOn: true,
  },
  {
    key: 'academic_resources',
    label: 'Resources Library & Past Questions',
    category: 'Campus Life',
    tier: 'P0',
    description: 'Academic file repository, lecture slide downloads, and verified department notes.',
    defaultOn: true,
  },
  {
    key: 'alumni_mentorship',
    label: 'Alumni Mentorship Hub',
    category: 'Commerce & Career',
    tier: 'P1',
    description: 'Connects undergraduates with alumni mentors for career coaching and 1-on-1 calls.',
    defaultOn: true,
  },
  {
    key: 'discussion_workspaces',
    label: 'Topic Discussions & Polls',
    category: 'Engagement & XP',
    tier: 'P0',
    description: 'Allows community forum threads, student voting polls, and departmental discussions.',
    defaultOn: true,
  },
  {
    key: 'forum_trends',
    label: 'Currently Threading & Forum Trends',
    category: 'Engagement & XP',
    tier: 'P1',
    description: 'Displays live trending campus discussions, hot hashtags, and popular thread topics in the forum feed.',
    defaultOn: true,
  },
  {
    key: 'e2ee_messaging',
    label: 'Direct Chat & Messages',
    category: 'AI & Tools',
    tier: 'P1',
    description: 'Enables private 1-on-1 direct messaging across students, mentors, and class reps.',
    defaultOn: true,
  },
  {
    key: 'live_weather',
    label: 'Live Campus Weather & Transit',
    category: 'Campus Life',
    tier: 'P1',
    description: 'Real-time university meteorological conditions, forecast, and walking transit advice via Open-Meteo.',
    defaultOn: true,
  },
  {
    key: 'global_library',
    label: 'Global Academic Library Search',
    category: 'Campus Life',
    tier: 'P0',
    description: 'Instant search across millions of open textbooks, academic papers, and covers via Open Library & arXiv.',
    defaultOn: true,
  },
  {
    key: 'campus_radio',
    label: 'Live Campus Radio Player',
    category: 'Campus Life',
    tier: 'P2',
    description: 'Listen to live campus broadcast stations (UI Diamond FM, UNILAG FM) with an in-app streaming player.',
    defaultOn: true,
  },
  {
    key: 'campus_map',
    label: 'Interactive Campus Map & Hall Locator',
    category: 'Campus Life',
    tier: 'P1',
    description: 'OpenStreetMap navigation for campus landmarks, lecture theatres, and hostel walking directions.',
    defaultOn: true,
  },
  {
    key: 'ai_study_copilot',
    label: 'AI Academic Study Copilot',
    category: 'AI & Tools',
    tier: 'P0',
    description: 'AI study assistant for concept explanation, past questions, and revision summaries (uses Google Gemini once the gemini-proxy key is configured; offline study templates otherwise).',
    defaultOn: true,
  },
  {
    key: 'currency_converter',
    label: 'Real-Time Currency & Price Converter',
    category: 'Commerce & Career',
    tier: 'P2',
    description: 'Live exchange rates converting NGN marketplace prices and alumni gifts into USD, EUR, and GBP.',
    defaultOn: true,
  },
  {
    key: 'alumni_network',
    label: 'Alumni Network & Directory',
    category: 'Campus Life',
    tier: 'P1',
    description: 'Enables alumni directory search, fellow graduates discovery, and connection requests.',
    defaultOn: true,
  },
  {
    key: 'campus_announcements',
    label: 'Campus Broadcasts & Announcements',
    category: 'Campus Life',
    tier: 'P1',
    description: 'Displays university administration broadcasts, faculty bulletins, and emergency announcements.',
    defaultOn: true,
  },
];

export const DEFAULT_FLAGS: Record<FeatureKey, boolean> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.defaultOn]),
) as Record<FeatureKey, boolean>;

const STORAGE_KEY = 'lioris_runtime_feature_flags_v8';
const isWeb = Platform.OS === 'web';

async function getStoredFlags(): Promise<string | null> {
  if (isWeb) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Pushes the flag set to platform_settings so every admin and device sees
 * it. Returns the failure instead of throwing so callers can finish their
 * local work (and still write the audit entry) before surfacing it.
 *
 * supabase-js resolves with `{ error }` rather than rejecting, so the old
 * `try/catch {}` around this never fired even in principle - a failed
 * platform-wide toggle looked exactly like a successful one.
 */
async function syncFlagsToPlatform(nextFlags: Record<string, boolean>): Promise<Error | null> {
  try {
    const { error } = await supabase.from('platform_settings').upsert({
      key: 'feature_flags',
      value: nextFlags,
      description: 'Runtime module killswitches and feature toggles',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return null;
  } catch (err: any) {
    console.warn('[FeatureFlags] Platform sync failed:', err?.message ?? err);
    return new Error(
      `Saved on this device only - the platform database could not be reached (${err?.message ?? 'unknown error'}).`,
    );
  }
}

async function setStoredFlags(value: string): Promise<void> {
  if (isWeb) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
    } catch {}
    return;
  }
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, value);
  } catch {}
}

interface FeatureFlagsContextValue {
  flags: Record<FeatureKey, boolean>;
  isFeatureEnabled: (key: FeatureKey) => boolean;
  toggleFeature: (key: FeatureKey) => Promise<void>;
  setFeature: (key: FeatureKey, enabled: boolean) => Promise<void>;
  resetDefaults: () => Promise<void>;
  isLoading: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue>({
  flags: DEFAULT_FLAGS,
  isFeatureEnabled: (key: FeatureKey) => DEFAULT_FLAGS[key] ?? false,
  toggleFeature: async () => {},
  setFeature: async () => {},
  resetDefaults: async () => {},
  isLoading: false,
});

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Record<FeatureKey, boolean>>(DEFAULT_FLAGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // The whole app now waits behind isLoading (see AppShell in
    // app/_layout.tsx) so nothing renders with the wrong DEFAULT_FLAGS.
    // A failsafe timeout keeps a stalled network request from holding that
    // gate open indefinitely - same pattern as the font-loading failsafe.
    const failsafe = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 4000);

    (async () => {
      const cached = await getStoredFlags();
      if (cached && mounted) {
        try {
          setFlags((prev) => ({ ...prev, ...JSON.parse(cached) }));
        } catch {}
      }
    })();

    // platform_settings is only readable by the `authenticated` role (RLS).
    // A single getSession()-then-fetch attempt still raced the client's own
    // internal auth initialization often enough to matter: getSession()
    // resolving doesn't guarantee the request layer has the JWT attached
    // yet, and this effect only ran once, so a lost race meant the whole
    // session stayed on all-enabled DEFAULT_FLAGS with no retry - some
    // screens correctly picked up a later fix, others (e.g.
    // CommunityFeedScreen's "Currently Threading") stayed stuck. Fetching
    // from onAuthStateChange instead means the fetch only ever fires once
    // Supabase itself has resolved auth state (it always emits an initial
    // event, signed-in or signed-out, right after that resolves).
    const { data: authListener } = supabase.auth.onAuthStateChange(async () => {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'feature_flags')
          .maybeSingle();

        if (!error && data?.value && mounted) {
          const remoteFlags = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          setFlags((prev) => {
            const merged = { ...prev, ...remoteFlags };
            setStoredFlags(JSON.stringify(merged)).catch(() => {});
            return merged;
          });
        }
      } catch {
        // Fallback to defaults/cache
      } finally {
        clearTimeout(failsafe);
        if (mounted) setIsLoading(false);
      }
    });

    if (isWeb && typeof window !== 'undefined') {
      const handleSync = (e: any) => {
        try {
          if (e.type === 'lioris_feature_flags_sync' && e.detail) {
            setFlags((prev) => ({ ...prev, ...e.detail }));
          } else if (e.type === 'storage' && e.key === STORAGE_KEY && e.newValue) {
            const incoming = JSON.parse(e.newValue);
            setFlags((prev) => ({ ...prev, ...incoming }));
          }
        } catch {}
      };

      window.addEventListener('lioris_feature_flags_sync', handleSync);
      window.addEventListener('storage', handleSync);

      return () => {
        mounted = false;
        clearTimeout(failsafe);
        authListener?.subscription?.unsubscribe();
        window.removeEventListener('lioris_feature_flags_sync', handleSync);
        window.removeEventListener('storage', handleSync);
      };
    }

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const isFeatureEnabled = (key: FeatureKey): boolean => {
    if (typeof flags?.[key] === 'boolean') {
      return flags[key];
    }
    return DEFAULT_FLAGS[key] ?? false;
  };

  const setFeature = async (key: FeatureKey, enabled: boolean) => {
    const nextFlags = { ...flags, [key]: enabled };
    setFlags(nextFlags);
    await setStoredFlags(JSON.stringify(nextFlags)).catch(() => {});

    if (isWeb && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lioris_feature_flags_sync', { detail: nextFlags }));
    }

    // Sync failure is reported, not swallowed. Feature flags are
    // platform-wide killswitches: an admin who turns one off and sees
    // "Disabled" needs to know when the change only reached their own
    // device. The local state above is already applied either way.
    const syncError = await syncFlagsToPlatform(nextFlags);

    const meta = FEATURE_CATALOG.find((f) => f.key === key);
    recordAuditLogEntry({
      action: 'feature_flag_toggled',
      summary: `Admin Feature Toggle: "${meta?.label || key}" set to ${enabled ? 'ENABLED' : 'DISABLED'}`,
      targetType: 'platform_config',
      targetId: key,
      reason: 'Admin runtime modular feature flag mutation',
    }).catch(() => {});

    if (syncError) throw syncError;
  };

  const toggleFeature = async (key: FeatureKey) => {
    await setFeature(key, !isFeatureEnabled(key));
  };

  const resetDefaults = async () => {
    setFlags(DEFAULT_FLAGS);
    await setStoredFlags(JSON.stringify(DEFAULT_FLAGS)).catch(() => {});
    const syncError = await syncFlagsToPlatform(DEFAULT_FLAGS);
    if (syncError) throw syncError;
  };

  const value = useMemo(
    () => ({
      flags,
      isFeatureEnabled,
      toggleFeature,
      setFeature,
      resetDefaults,
      isLoading,
    }),
    [flags, isLoading],
  );

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}
