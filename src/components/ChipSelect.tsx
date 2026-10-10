import React, { useRef } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';

interface ChipSelectProps<T extends string> {
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
  /** One swipeable row instead of wrapping onto several lines - for long lists on a phone. */
  scroll?: boolean;
}

export function ChipSelect<T extends string>({ options, selected, onToggle, scroll }: ChipSelectProps<T>) {
  const { colors, radius, spacing } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const chipLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const handlePressChip = (option: T) => {
    const savedX = scrollXRef.current;
    const vw = viewportWidthRef.current;
    const layout = chipLayoutsRef.current[option];
    let targetX = savedX;

    if (scroll && layout && vw > 0) {
      const rightEdge = layout.x + layout.width;
      if (rightEdge > savedX + vw - 16) {
        targetX = Math.max(0, rightEdge - vw + 24);
      } else if (layout.x < savedX + 12) {
        targetX = Math.max(0, layout.x - 16);
      }
    }

    onToggle(option);

    if (scroll) {
      scrollXRef.current = targetX;
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
  };

  if (scroll) {
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
        contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}
        style={{ flexGrow: 0 }}
        {...({ 'data-horizontal-scroll': 'true' } as any)}
      >
        {options.map((option) => {
          const isSelected = selected.includes(option);
          return (
            <Pressable
              key={option}
              onLayout={(e) => {
                chipLayoutsRef.current[option] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
              }}
              onPress={() => handlePressChip(option)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={option}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: isSelected ? colors.brandPrimary : colors.border,
                backgroundColor: isSelected ? `${colors.brandPrimary}18` : 'transparent',
              }}
            >
              <AppText variant="bodySmall" weight="semiBold" tone={isSelected ? 'brand' : 'secondary'}>
                {option}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            onPress={() => onToggle(option)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={option}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: isSelected ? colors.brandPrimary : colors.border,
              backgroundColor: isSelected ? `${colors.brandPrimary}18` : 'transparent',
            }}
          >
            <AppText variant="bodySmall" weight="semiBold" tone={isSelected ? 'brand' : 'secondary'}>
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
