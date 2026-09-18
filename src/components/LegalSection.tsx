import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';

/**
 * Presentational helpers shared by the long-form legal screens
 * (privacy, terms, community rules) so policy content stays readable
 * and the screens keep a consistent look.
 */

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

export function LegalParagraph({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
      {children}
    </AppText>
  );
}

export function LegalBullets({ items }: { items: React.ReactNode[] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((item, idx) => (
        <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
          <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
            {'\u2022'}
          </AppText>
          <AppText variant="body" tone="secondary" style={{ lineHeight: 24, flex: 1 }}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** Inline bold emphasis inside a legal paragraph/bullet. */
export function LegalStrong({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <AppText weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
      {children}
    </AppText>
  );
}

/** Highlighted placeholder that the owner must fill in before launch. */
export function LegalPlaceholder({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <AppText weight="bold" style={{ color: colors.warning }}>
      {children}
    </AppText>
  );
}
