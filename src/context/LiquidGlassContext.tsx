import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'lioris_liquid_glass_settings_v1';

export interface LiquidGlassSettings {
  /** Opacity / Alpha of the background (0.10 = ultra clear, 0.90 = dense frost). Default: 0.40 */
  translucency: number;
  /** Backdrop blur filter in px (8 to 50). Default: 24 */
  blurIntensity: number;
  /** Refraction color saturation in % (100 to 240). Default: 195 */
  refractionSaturation: number;
  /** Surface tension specular reflection opacity (0.0 to 0.50). Default: 0.22 */
  specularShine: number;
  /** Glass perimeter hairline border opacity (0.02 to 0.20). Default: 0.07 */
  borderOpacity: number;
  /** Active preset name */
  preset: 'ios26' | 'frosted' | 'crystal' | 'obsidian' | 'custom';
}

export const PRESETS: Record<'ios26' | 'frosted' | 'crystal' | 'obsidian', LiquidGlassSettings> = {
  ios26: {
    translucency: 0.38,
    blurIntensity: 26,
    refractionSaturation: 200,
    specularShine: 0.25,
    borderOpacity: 0.07,
    preset: 'ios26',
  },
  crystal: {
    translucency: 0.20,
    blurIntensity: 18,
    refractionSaturation: 170,
    specularShine: 0.35,
    borderOpacity: 0.10,
    preset: 'crystal',
  },
  frosted: {
    translucency: 0.65,
    blurIntensity: 30,
    refractionSaturation: 160,
    specularShine: 0.18,
    borderOpacity: 0.09,
    preset: 'frosted',
  },
  obsidian: {
    translucency: 0.45,
    blurIntensity: 35,
    refractionSaturation: 210,
    specularShine: 0.15,
    borderOpacity: 0.05,
    preset: 'obsidian',
  },
};

const DEFAULT_SETTINGS: LiquidGlassSettings = PRESETS.ios26;

interface LiquidGlassContextValue {
  settings: LiquidGlassSettings;
  updateSetting: <K extends keyof LiquidGlassSettings>(key: K, value: LiquidGlassSettings[K]) => void;
  applyPreset: (preset: 'ios26' | 'frosted' | 'crystal' | 'obsidian') => void;
  resetDefaults: () => void;
  /** Returns computed background color, border, and backdropFilter for components */
  getGlassBackground: (isDark: boolean, customAlpha?: number) => string;
  getGlassBorderColor: (isDark: boolean) => string;
  getBackdropFilterString: () => string;
}

const LiquidGlassContext = createContext<LiquidGlassContextValue | undefined>(undefined);

export function LiquidGlassProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LiquidGlassSettings>(DEFAULT_SETTINGS);

  // Load saved settings on startup
  useEffect(() => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setSettings((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {
      // no-op
    }
  }, []);

  const saveSettings = (newSettings: LiquidGlassSettings) => {
    setSettings(newSettings);
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      }
    } catch {
      // no-op
    }
  };

  const updateSetting = <K extends keyof LiquidGlassSettings>(key: K, value: LiquidGlassSettings[K]) => {
    saveSettings({
      ...settings,
      [key]: value,
      preset: 'custom',
    });
  };

  const applyPreset = (presetName: 'ios26' | 'frosted' | 'crystal' | 'obsidian') => {
    saveSettings(PRESETS[presetName]);
  };

  const resetDefaults = () => {
    saveSettings(DEFAULT_SETTINGS);
  };

  const getGlassBackground = (isDark: boolean, customAlpha?: number): string => {
    const alpha = customAlpha ?? settings.translucency;
    if (isDark) {
      // Sleek deep navy/slate translucent liquid base
      return `rgba(15, 23, 42, ${alpha.toFixed(2)})`;
    }
    // Luminous crystal white liquid base
    return `rgba(255, 255, 255, ${(alpha * 1.15).toFixed(2)})`;
  };

  const getGlassBorderColor = (isDark: boolean): string => {
    const bAlpha = settings.borderOpacity;
    return isDark ? `rgba(255, 255, 255, ${bAlpha.toFixed(2)})` : `rgba(255, 255, 255, ${(bAlpha * 2.5).toFixed(2)})`;
  };

  const getBackdropFilterString = (): string => {
    return `blur(${settings.blurIntensity}px) saturate(${settings.refractionSaturation}%) brightness(105%)`;
  };

  const value = useMemo(
    () => ({
      settings,
      updateSetting,
      applyPreset,
      resetDefaults,
      getGlassBackground,
      getGlassBorderColor,
      getBackdropFilterString,
    }),
    [settings]
  );

  return <LiquidGlassContext.Provider value={value}>{children}</LiquidGlassContext.Provider>;
}

export function useLiquidGlass() {
  const context = useContext(LiquidGlassContext);
  if (!context) {
    // Graceful fallback if rendered outside provider
    return {
      settings: DEFAULT_SETTINGS,
      updateSetting: () => {},
      applyPreset: () => {},
      resetDefaults: () => {},
      getGlassBackground: (isDark: boolean) => (isDark ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.55)'),
      getGlassBorderColor: (isDark: boolean) => (isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.35)'),
      getBackdropFilterString: () => 'blur(24px) saturate(195%) brightness(105%)',
    };
  }
  return context;
}
