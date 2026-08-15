import React from'react';
import { Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

export interface ShortcutLink {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

/** Ported from"My Shortcuts & Comfort Board" — quick links to portal-style destinations (fees, hostel, timetable, library). */
export function ShortcutsBoard({ links }: { links: ShortcutLink[] }) {
  const { spacing, colors } = useTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {links.map((link) => (
        <Pressable
          key={link.label}
          onPress={link.onPress}
          accessibilityRole="button"accessibilityLabel={link.label}
          style={{ flex: 1, minWidth: '45%' }}
        >
          <SolidCard radius={16} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <Ionicons name={link.icon} size={22} color={colors.brandAccent} />
            <AppText variant="bodySmall" weight="semiBold" style={{ marginTop: spacing.xs, textAlign: 'center' }} numberOfLines={1}>
              {link.label}
            </AppText>
          </SolidCard>
        </Pressable>
      ))}
    </View>
  );
}
