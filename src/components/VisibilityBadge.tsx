import React from'react';
import { View } from'react-native';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

type Visibility = 'campus' | 'global' | 'private';

const CONFIG: Record<Visibility, { label: string; lightBg: string; lightText: string; darkBg: string; darkText: string }> = {
  global: {
    label: 'Global 🌍',
    lightBg: '#EFF6FF',
    lightText: '#1D4ED8',
    darkBg: 'rgba(96,165,250,0.18)',
    darkText: '#93C5FD',
  },
  private: {
    label: 'Private',
    lightBg: '#FEF2F2',
    lightText: '#991B1B',
    darkBg: 'rgba(252,165,165,0.18)',
    darkText: '#FCA5A5',
  },
  campus: {
    label: 'Campus',
    lightBg: '#ECFDF5',
    lightText: '#065F46',
    darkBg: 'rgba(52,211,153,0.18)',
    darkText: '#6EE7B7',
  },
};

export function VisibilityBadge({
  visibility,
  campusCode,
}: {
  visibility?: Visibility | string;
  campusCode?: string | null;
}) {
  const { isDark } = useTheme();
  const visKey = (visibility === 'global' ? 'global' : visibility === 'private' ? 'private' : 'campus') as Visibility;
  const config = CONFIG[visKey] || CONFIG.campus;
  const bg = isDark ? config.darkBg : config.lightBg;
  const text = isDark ? config.darkText : config.lightText;
  const label =
    visKey === 'campus' && campusCode && campusCode !== 'GLOBAL'
      ? `${campusCode} 🏫`
      : config.label;

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${text}40`,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <AppText variant="caption" weight="bold" style={{ color: text, fontSize: 11 }}>
        {label}
      </AppText>
    </View>
  );
}
