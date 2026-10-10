import React, { useRef } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
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
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(e) => {
        scrollXRef.current = e.nativeEvent.contentOffset.x;
      }}
      onLayout={(e) => {
        viewportWidthRef.current = e.nativeEvent.layout.width;
      }}
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
            onLayout={(e) => {
              tabLayoutsRef.current[tab.key] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width,
              };
            }}
            onPress={() => {
              if (!selected) {
                const savedX = scrollXRef.current;
                const vw = viewportWidthRef.current;
                const layout = tabLayoutsRef.current[tab.key];
                let targetX = savedX;
                if (layout && vw > 0) {
                  const rightEdge = layout.x + layout.width;
                  if (rightEdge > savedX + vw - 16) {
                    targetX = Math.max(0, rightEdge - vw + 24);
                  } else if (layout.x < savedX + 12) {
                    targetX = Math.max(0, layout.x - 16);
                  }
                }
                scrollXRef.current = targetX;
                haptics.light();
                onChange(tab.key);
                requestAnimationFrame(() => {
                  const sv = scrollRef.current as any;
                  if (!sv) return;
                  const domNode = sv.getScrollableNode?.() ?? sv;
                  if (Platform.OS === 'web' && domNode && typeof domNode.scrollLeft === 'number') {
                    domNode.scrollLeft = targetX;
                  } else {
                    sv.scrollTo?.({ x: targetX, animated: true });
                  }
                });
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
