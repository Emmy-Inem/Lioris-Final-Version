import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import { ADMIN_GROUPS, AdminGroupKey, stripGroups } from './adminNav';

const savedScrollXByGroup: Record<string, number> = {};
const savedViewportWidthByGroup: Record<string, number> = {};
const savedTabLayoutsByGroup: Record<string, Record<string, { x: number; width: number }>> = {};

const useIsomorphicLayoutEffect = Platform.OS === 'web' ? useLayoutEffect : useEffect;

/**
 * The row of pills at the top of every page in an admin group (People: Members / ID Verification /
 * Support, ...). It is what makes a group feel like one place; the bottom bar only shows the group.
 * `badges` puts a count next to a section, e.g. { verification: 3 }.
 */
export function AdminSectionTabs({
  group,
  badges,
}: {
  group: AdminGroupKey;
  badges?: Record<string, number | undefined>;
}) {
  const { colors, spacing, radius } = useTheme();
  const pathname = stripGroups(usePathname());
  const definition = ADMIN_GROUPS.find((g) => g.key === group);
  const scrollRef = useRef<ScrollView>(null);

  const activeSectionKey = definition?.sections.find(
    (section) => pathname === section.path || pathname.startsWith(`${section.path}/`),
  )?.key;

  const syncScrollPosition = useCallback(
    (animateIfAdjusted = false) => {
      const scrollView = scrollRef.current as any;
      if (!scrollView) return;

      let targetX = savedScrollXByGroup[group] ?? 0;
      const vw = savedViewportWidthByGroup[group] ?? 0;
      const layouts = savedTabLayoutsByGroup[group];
      const activeLayout = activeSectionKey && layouts ? layouts[activeSectionKey] : undefined;

      if (activeLayout && vw > 0) {
        const rightEdge = activeLayout.x + activeLayout.width;
        if (rightEdge > targetX + vw - 16) {
          targetX = Math.max(0, rightEdge - vw + 24);
        } else if (activeLayout.x < targetX + 12) {
          targetX = Math.max(0, activeLayout.x - 16);
        }
      }

      savedScrollXByGroup[group] = targetX;
      const domNode = scrollView.getScrollableNode?.() ?? scrollView;
      if (Platform.OS === 'web' && domNode && typeof domNode.scrollLeft === 'number') {
        domNode.scrollLeft = targetX;
      }
      scrollView.scrollTo?.({ x: targetX, animated: animateIfAdjusted });
    },
    [group, activeSectionKey],
  );

  useIsomorphicLayoutEffect(() => {
    syncScrollPosition(false);
  }, [syncScrollPosition]);

  if (!definition || definition.sections.length < 2) return null;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          savedScrollXByGroup[group] = e.nativeEvent.contentOffset.x;
        }}
        onLayout={(e) => {
          savedViewportWidthByGroup[group] = e.nativeEvent.layout.width;
          syncScrollPosition(false);
        }}
        onContentSizeChange={() => {
          syncScrollPosition(false);
        }}
        contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
        {...({ 'data-horizontal-scroll': 'true' } as any)}
      >
        {definition.sections.map((section) => {
          const selected = pathname === section.path || pathname.startsWith(`${section.path}/`);
          const count = badges?.[section.key];
          return (
            <Pressable
              key={section.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={count ? `${section.label}, ${count} waiting` : section.label}
              onLayout={(e) => {
                if (!savedTabLayoutsByGroup[group]) {
                  savedTabLayoutsByGroup[group] = {};
                }
                savedTabLayoutsByGroup[group][section.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
                if (selected) {
                  syncScrollPosition(false);
                }
              }}
              onPress={() => {
                const scrollView = scrollRef.current as any;
                const domNode = scrollView?.getScrollableNode?.() ?? scrollView;
                if (Platform.OS === 'web' && domNode && typeof domNode.scrollLeft === 'number') {
                  savedScrollXByGroup[group] = domNode.scrollLeft;
                }
                if (selected) return;
                haptics.light();
                router.replace(section.route as any);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 38,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                backgroundColor: selected ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: selected ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="bodySmall" weight={selected ? 'bold' : 'semiBold'} tone={selected ? 'inverse' : 'secondary'}>
                {section.label}
              </AppText>
              {count ? (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? '#FFFFFF' : colors.critical,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    style={{ fontSize: 10, lineHeight: 12, color: selected ? colors.brandPrimary : '#FFFFFF' }}
                  >
                    {count > 99 ? '99+' : count}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
