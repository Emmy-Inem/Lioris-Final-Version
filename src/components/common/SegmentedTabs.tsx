import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

export interface SegmentedTab {
  key: string;
  label: string;
  /** Small count shown next to the label (0/undefined hides it). */
  badge?: number;
}

/** A row of pill tabs. Scrolls sideways when there are too many for the width. */
export function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SegmentedTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
      {...({ 'data-horizontal-scroll': 'true' } as any)}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                haptics.light();
                onChange(tab.key);
              }
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: selected ? colors.brandPrimary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.brandPrimary : colors.border,
            }}
          >
            <AppText variant="bodySmall" weight={selected ? 'bold' : 'medium'} style={{ color: selected ? '#FFFFFF' : colors.textPrimary }}>
              {tab.label}
            </AppText>
            {tab.badge ? (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  paddingHorizontal: 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? 'rgba(255,255,255,0.28)' : colors.pastelPrimaryBg,
                }}
              >
                <AppText weight="bold" style={{ fontSize: 10.5, color: selected ? '#FFFFFF' : colors.brandPrimary }}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
