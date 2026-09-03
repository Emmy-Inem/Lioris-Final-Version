import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/api/supabase';
import { recordAuditLogEntry } from '@/api/auditLog';

export type FeatureKey =
  | 'xp_gamification'
  | 'career_page'
  | 'marketplace'
  | 'utility_cards'
  | 'study_groups'
  | 'campus_events'
  | 'academic_resources'
  | 'alumni_mentorship'
  | 'stories_bar'
  | 'discussion_workspaces'
  | 'ai_copilot'
  | 'e2ee_messaging';

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
    key: 'xp_gamification',
    label: 'XP Gamification & Streaks',
    category: 'Engagement & XP',
    tier: 'P1',
    description: 'Awards streak counters, badges, and leaderboard rankings across campus feeds.',
    defaultOn: false,
  },
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
    key: 'stories_bar',
    label: 'Stories & Fleets Bar',
    category: 'Engagement & XP',
    tier: 'P2',
    description: 'Displays temporary 24-hour campus photo stories at the top of feeds.',
    defaultOn: false,
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
    key: 'ai_copilot',
    label: 'AI Campus Study Copilot',
    category: 'AI & Tools',
    tier: 'P2',
    description: 'Generates lecture summaries and smart past-question explanations.',
    defaultOn: false,
  },
  {
    key: 'e2ee_messaging',
    label: 'Direct Chat & Messages',
    category: 'AI & Tools',
    tier: 'P1',
    description: 'Enables private 1-on-1 direct messaging across students, mentors, and class reps.',
    defaultOn: true,
  },
];

export const DEFAULT_FLAGS: Record<FeatureKey, boolean> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.defaultOn]),
) as Record<FeatureKey, boolean>;

const STORAGE_KEY = 'lioris_runtime_feature_flags_v7';
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

    async function loadFlags() {
      try {
        const cached = await getStoredFlags();
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          setFlags((prev) => ({ ...prev, ...parsed }));
        }

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
        // Fallback to defaults
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadFlags();

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
        window.removeEventListener('lioris_feature_flags_sync', handleSync);
        window.removeEventListener('storage', handleSync);
      };
    }

    return () => {
      mounted = false;
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

    try {
      await supabase.from('platform_settings').upsert({
        key: 'feature_flags',
        value: nextFlags,
        description: 'Runtime module killswitches and feature toggles',
        updated_at: new Date().toISOString(),
      });
    } catch {}

    const meta = FEATURE_CATALOG.find((f) => f.key === key);
    recordAuditLogEntry({
      action: 'feature_flag_toggled',
      summary: `Admin Feature Toggle: "${meta?.label || key}" set to ${enabled ? 'ENABLED' : 'DISABLED'}`,
      targetType: 'platform_config',
      targetId: key,
      reason: 'Admin runtime modular feature flag mutation',
    }).catch(() => {});
  };

  const toggleFeature = async (key: FeatureKey) => {
    await setFeature(key, !isFeatureEnabled(key));
  };

  const resetDefaults = async () => {
    setFlags(DEFAULT_FLAGS);
    await setStoredFlags(JSON.stringify(DEFAULT_FLAGS)).catch(() => {});
    try {
      await supabase.from('platform_settings').upsert({
        key: 'feature_flags',
        value: DEFAULT_FLAGS,
        description: 'Runtime module killswitches and feature toggles',
        updated_at: new Date().toISOString(),
      });
    } catch {}
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
