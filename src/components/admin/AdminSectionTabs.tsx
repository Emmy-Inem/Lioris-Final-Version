import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { AppText } from '../AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';
import { ADMIN_GROUPS, AdminGroupKey, stripGroups } from './adminNav';

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
  if (!definition || definition.sections.length < 2) return null;

  return (
    <View style={{ marginBottom: spacing.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
              onPress={() => {
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
