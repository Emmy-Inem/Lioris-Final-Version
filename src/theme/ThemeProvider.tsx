import React, { createContext, useContext, useEffect, useMemo, useState } from'react';
import { Platform, useColorScheme } from'react-native';
import * as SecureStore from'expo-secure-store';
import { useQuery } from'@tanstack/react-query';
import { darkColors, lightColors, ThemeColors, institutionThemeOverrides, ACCENT_PRESETS, AccentPreset } from'./colors';
import { spacing, radius, minTouchTarget, glassBlur } from'./tokens';
import { useAuth } from'@/auth/AuthContext';
import { getMyProfile } from'@/api/profile';
import { useViewScope } from'@/hooks/useViewScope';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_MODE_KEY = 'lioris.themeMode';
const ACCENT_COLOR_KEY = 'lioris.customAccent';
const isWeb = Platform.OS === 'web';

async function getStoredValue(key: string): Promise<string | null> {
 try {
 if (isWeb) {
 return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
 }
 return await SecureStore.getItemAsync(key);
 } catch {
 return null;
 }
}

async function setStoredValue(key: string, value: string): Promise<void> {
 try {
 if (isWeb) {
 if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
 return;
 }
 await SecureStore.setItemAsync(key, value);
 } catch {}
}

interface ThemeContextValue {
 colors: ThemeColors;
 isDark: boolean;
 themeMode: ThemeMode;
 setThemeMode: (mode: ThemeMode) => Promise<void>;
 toggleTheme: () => Promise<void>;
 customAccent: string | null;
 setCustomAccent: (accentId: string | null) => Promise<void>;
 resetToDefaultTheme: () => Promise<void>;
 isDefaultTheme: boolean;
 accentPresets: AccentPreset[];
 spacing: typeof spacing;
 radius: typeof radius;
 minTouchTarget: number;
 glassBlur: typeof glassBlur;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Web-only global accessibility CSS: a visible keyboard focus ring (some
 * components set `outline-style: none`, which would otherwise leave keyboard
 * users without a focus indicator) and reduced-motion support for CSS
 * transitions/animations.
 */
function useWebA11yStyles(ringColor: string) {
 useEffect(() => {
 if (!isWeb || typeof document === 'undefined') return;
 const id = 'lioris-a11y-css';
 let el = document.getElementById(id) as HTMLStyleElement | null;
 if (!el) {
 el = document.createElement('style');
 el.id = id;
 document.head.appendChild(el);
 }
 el.textContent =
 `a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,` +
 `[role="button"]:focus-visible,[role="link"]:focus-visible,[role="tab"]:focus-visible,[role="checkbox"]:focus-visible,` +
 `[role="switch"]:focus-visible,[role="radio"]:focus-visible,[role="menuitem"]:focus-visible,[tabindex="0"]:focus-visible{` +
 `outline:2px solid ${ringColor} !important;outline-offset:2px !important;}` +
 `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;` +
 `animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important;}}`;
 }, [ringColor]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
 const systemScheme = useColorScheme();
 const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
 const [customAccent, setCustomAccentState] = useState<string | null>(null);
 const { user } = useAuth();
 const { scope, activeCampusCode } = useViewScope();

 useEffect(() => {
 (async () => {
 const storedMode = await getStoredValue(THEME_MODE_KEY);
 if (storedMode === 'system' || storedMode === 'light' || storedMode === 'dark') {
 setThemeModeState(storedMode as ThemeMode);
 }
 const storedAccent = await getStoredValue(ACCENT_COLOR_KEY);
 if (storedAccent) {
 setCustomAccentState(storedAccent);
 }
 })();
 }, []);

 const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

 const { data: profile } = useQuery({
 queryKey: ['profile', 'me', user?.id],
 queryFn: () => getMyProfile(user!),
 enabled: !!user,
 });

 const setThemeMode = async (mode: ThemeMode) => {
 setThemeModeState(mode);
 await setStoredValue(THEME_MODE_KEY, mode);
 };

 const toggleTheme = async () => {
 const nextMode: ThemeMode = isDark ? 'light' : 'dark';
 await setThemeMode(nextMode);
 };

 const setCustomAccent = async (accentId: string | null) => {
 setCustomAccentState(accentId);
 if (accentId) {
 await setStoredValue(ACCENT_COLOR_KEY, accentId);
 } else if (isWeb) {
 if (typeof localStorage !== 'undefined') localStorage.removeItem(ACCENT_COLOR_KEY);
 } else {
 await SecureStore.deleteItemAsync(ACCENT_COLOR_KEY).catch(() => {});
 }
 };

 const value = useMemo<ThemeContextValue>(() => {
 const base = isDark ? darkColors : lightColors;

 // Determine active override source: custom accent preset, global scope, or campus code
 let activeKey = customAccent;
 if (!activeKey) {
 if (scope === 'global') {
 activeKey = 'GLOBAL';
 } else {
 activeKey =
 activeCampusCode && activeCampusCode !== 'GLOBAL'
 ? activeCampusCode
 : profile?.institutionCode && profile.institutionCode !== 'GLOBAL'
 ? profile.institutionCode
 : 'GLOBAL';
 }
 }

 const override = activeKey ? institutionThemeOverrides[activeKey] : undefined;
 const colors = override ? { ...base, ...(isDark ? override.dark : override.light) } : base;

 const isDefaultTheme = !customAccent || customAccent === 'GLOBAL';

 const resetToDefaultTheme = async () => {
 await setCustomAccent(null);
 };

 return {
 colors,
 isDark,
 themeMode,
 setThemeMode,
 toggleTheme,
 customAccent,
 setCustomAccent,
 resetToDefaultTheme,
 isDefaultTheme,
 accentPresets: ACCENT_PRESETS,
 spacing,
 radius,
 minTouchTarget,
 glassBlur,
 };
 }, [isDark, themeMode, customAccent, scope, activeCampusCode, profile?.institutionCode]);

 useWebA11yStyles(value.colors.brandPrimary);

 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
 const ctx = useContext(ThemeContext);
 if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
 return ctx;
}

export function useSafeTheme(): { colors: ThemeColors; isDark: boolean } {
 const ctx = useContext(ThemeContext);
 const colorScheme = useColorScheme();
 if (ctx) {
 return { colors: ctx.colors, isDark: ctx.isDark };
 }
 const isDark = colorScheme === 'dark';
 return {
 colors: isDark ? darkColors : lightColors,
 isDark,
 };
}
