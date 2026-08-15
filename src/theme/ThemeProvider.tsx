import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { darkColors, lightColors, ThemeColors, institutionThemeOverrides } from './colors';
import { spacing, radius, minTouchTarget, glassBlur } from './tokens';
import { useAuth } from '@/auth/AuthContext';
import { getMyProfile } from '@/api/profile';

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  minTouchTarget: number;
  glassBlur: typeof glassBlur;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Each launch university gets its own brand color (FUNAAB green,
 * UNILAG blue, UI violet) — this requires knowing the signed-in user's
 * institution, which is why ThemeProvider now sits inside
 * QueryClientProvider/AuthProvider in the root layout rather than
 * wrapping them (it used to, before this needed profile data).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const value = useMemo<ThemeContextValue>(() => {
    const base = isDark ? darkColors : lightColors;
    const override = profile?.institutionCode ? institutionThemeOverrides[profile.institutionCode] : undefined;
    const colors = override ? { ...base, ...(isDark ? override.dark : override.light) } : base;

    return {
      colors,
      isDark,
      spacing,
      radius,
      minTouchTarget,
      glassBlur,
    };
  }, [isDark, profile?.institutionCode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
