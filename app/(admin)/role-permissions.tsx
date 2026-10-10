import React, { useState, useMemo } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AdminSectionTabs } from '@/components/admin/AdminSectionTabs';
import { SuperAdminGate } from '@/auth/SuperAdminGate';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { AppButton } from '@/components/AppButton';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { usePermissions } from '@/context/RolePermissionsContext';
import { SystemRole, PermissionKey, RolePermissionRecord } from '@/api/rolePermissions';

interface RoleTabDef {
  key: SystemRole;
  label: string;
  badge: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const ROLE_TABS: RoleTabDef[] = [
  {
    key: 'student',
    label: 'Student',
    badge: 'Undergraduate',
    description: 'Current verified students enrolled across launch universities.',
    icon: 'school-outline',
  },
  {
    key: 'alumni',
    label: 'Alumni',
    badge: 'Graduate',
    description: 'Graduated alumni members, mentors, and employers.',
    icon: 'ribbon-outline',
  },
  {
    key: 'staff',
    label: 'Staff & Faculty',
    badge: 'Faculty',
    description: 'University lecturers, department heads, and academic staff.',
    icon: 'briefcase-outline',
  },
  {
    key: 'campus_admin',
    label: 'Campus Admin',
    badge: 'Campus Moderator',
    description: 'Campus ambassadors and local moderators scoped to their university.',
    icon: 'shield-outline',
  },
  {
    key: 'super_admin',
    label: 'Super Admin',
    badge: 'Global Authority',
    description: 'Platform administrators with nationwide governance authority.',
    icon: 'shield-checkmark-outline',
  },
];

const PERMISSION_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  can_post_forum: 'chatbubbles-outline',
  can_comment_forum: 'chatbubble-ellipses-outline',
  can_create_spaces: 'cube-outline',
  can_upload_resources: 'cloud-upload-outline',
  can_download_resources: 'cloud-download-outline',
  can_review_resources: 'checkmark-circle-outline',
  can_create_events: 'calendar-outline',
  can_rsvp_events: 'ticket-outline',
  can_access_marketplace: 'cart-outline',
  can_list_marketplace: 'pricetag-outline',
  can_access_jobs: 'briefcase-outline',
  can_post_jobs: 'newspaper-outline',
  can_join_study_pods: 'people-outline',
  can_create_study_pods: 'add-circle-outline',
  can_access_mentorship: 'heart-outline',
  can_offer_mentorship: 'star-outline',
  can_send_messages: 'mail-outline',
  can_moderate_campus: 'shield-outline',
  can_verify_students: 'id-card-outline',
  can_broadcast_announcements: 'megaphone-outline',
  can_manage_roles: 'person-add-outline',
  can_configure_platform: 'settings-outline',
};

export default function RolePermissionsScreen() {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const { records, isLoading, setPermission, resetToDefaults } = usePermissions();

  const [activeRole, setActiveRole] = useState<SystemRole>('student');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Filter records for active role
  const roleRecords = useMemo(() => {
    return records.filter((r) => r.role === activeRole);
  }, [records, activeRole]);

  // Extract distinct categories for category pills
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of roleRecords) {
      if (r.category) set.add(r.category);
    }
    return ['All', ...Array.from(set)];
  }, [roleRecords]);

  // Apply search and category filter
  const filteredRecords = useMemo(() => {
    return roleRecords.filter((r) => {
      if (categoryFilter !== 'All' && r.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesLabel = r.label.toLowerCase().includes(q);
        const matchesDesc = (r.description || '').toLowerCase().includes(q);
        const matchesKey = r.permissionKey.toLowerCase().includes(q);
        if (!matchesLabel && !matchesDesc && !matchesKey) return false;
      }
      return true;
    });
  }, [roleRecords, categoryFilter, searchQuery]);

  const activeCount = useMemo(() => {
    return roleRecords.filter((r) => r.enabled).length;
  }, [roleRecords]);

  const totalCount = roleRecords.length;

  const activeRoleDef = useMemo(() => {
    return ROLE_TABS.find((t) => t.key === activeRole) || ROLE_TABS[0];
  }, [activeRole]);

  async function handleTogglePermission(item: RolePermissionRecord) {
    if (item.isCritical && activeRole === 'super_admin') {
      haptics.error();
      Alert.alert(
        'Critical Permission Protected',
        `"${item.label}" is a protected core capability for Super Administrators and cannot be turned off.`,
      );
      return;
    }

    haptics.medium();
    const nextValue = !item.enabled;
    try {
      await setPermission(activeRole, item.permissionKey, nextValue);
      toast.success(`${item.label} is now ${nextValue ? 'Enabled' : 'Disabled'} for ${activeRoleDef.label}s.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update permission in database.');
    }
  }

  function handleConfirmResetRoleDefaults() {
    haptics.error();
    Alert.alert(
      'Reset Role Defaults?',
      `Restore all permissions for "${activeRoleDef.label}" back to standard factory settings? Any custom permission toggles for this role will be reset.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Defaults',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            try {
              await resetToDefaults(activeRole);
              toast.info(`Permissions for ${activeRoleDef.label} restored to factory baseline.`);
            } catch (err: any) {
              toast.error(err?.message || 'Could not reset permissions.');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SuperAdminGate>
      <ScreenContainer glow={true}>
        {!isDesktop && <AppHeader />}

        <View style={{ paddingTop: isDesktop ? 4 : 8 }}>
          <AdminSectionTabs group="platform" />
        </View>

        <ScrollView
          style={{ flex: 1, width: '100%', minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 150 }}
        >
          {/* Header Title & Actions */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              paddingTop: isDesktop ? spacing.xs : spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <View style={{ flex: 1, paddingRight: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <AppText variant={isDesktop ? 'h1' : 'h3'} weight="bold">
                  Role Permissions & Access Control
                </AppText>
                <Badge label="Database Backed" tone="brand" />
              </View>
              <AppText tone="secondary" variant="caption">
                Configure exact capabilities and restrictions for each user role across the platform.
              </AppText>
            </View>

            <AppButton
              label="Reset Defaults"
              variant="secondary"
              size={isDesktop ? 'md' : 'sm'}
              loading={isResetting}
              onPress={handleConfirmResetRoleDefaults}
            />
          </View>

          {/* Role Segmented Switcher */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, paddingVertical: 4 }}
            style={{ marginBottom: spacing.md, flexGrow: 0 }}
          >
            {ROLE_TABS.map((tab) => {
              const selected = activeRole === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    haptics.light();
                    setActiveRole(tab.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${tab.label} role permissions`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.brandPrimary : colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.brandPrimary : colors.border,
                  }}
                >
                  <Ionicons name={tab.icon} size={16} color={selected ? '#FFFFFF' : colors.textPrimary} />
                  <AppText variant="bodySmall" weight="bold" tone={selected ? 'inverse' : 'primary'}>
                    {tab.label}
                  </AppText>
                  <View style={{ marginLeft: 4 }}>
                    <Badge
                      label={tab.badge}
                      tone={selected ? 'neutral' : 'brand'}
                    />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Role Summary Banner */}
          <SolidCard
            radius={18}
            style={{
              marginBottom: spacing.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.pastelPrimaryBg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Ionicons name={activeRoleDef.icon} size={18} color={colors.brandPrimary} />
                  <AppText variant="body" weight="bold">
                    {activeRoleDef.label} Capabilities Matrix
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary">
                  {activeRoleDef.description}
                </AppText>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="h3" weight="bold" style={{ color: colors.brandPrimary }}>
                    {activeCount} / {totalCount}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    Active Permissions
                  </AppText>
                </View>
              </View>
            </View>
          </SolidCard>

          {/* Search Bar & Category Filters */}
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <AppTextField
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${activeRoleDef.label} permissions...`}
              leftIcon="search-outline"
              clearButtonMode="while-editing"
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.xs }}
              style={{ flexGrow: 0 }}
            >
              {categories.map((cat) => {
                const selected = categoryFilter === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      haptics.light();
                      setCategoryFilter(cat);
                    }}
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                      backgroundColor: selected ? colors.textPrimary : colors.divider,
                    }}
                  >
                    <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'secondary'}>
                      {cat}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Permissions Cards List */}
          {filteredRecords.length > 0 ? (
            <View style={isDesktop ? { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } : undefined}>
              {filteredRecords.map((item) => {
                const iconName = PERMISSION_ICON_MAP[item.permissionKey] || 'shield-outline';
                const isProtectedCritical = item.isCritical && activeRole === 'super_admin';

                return (
                  <View key={item.id} style={isDesktop ? { flexGrow: 1, flexBasis: 0, minWidth: 280 } : undefined}>
                    <SolidCard
                      radius={18}
                      style={{
                        marginBottom: spacing.sm,
                        borderWidth: 1,
                        borderColor: item.enabled ? colors.border : `${colors.critical}20`,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: item.enabled ? colors.pastelPrimaryBg : colors.divider,
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: 2,
                            }}
                          >
                            <Ionicons
                              name={iconName}
                              size={18}
                              color={item.enabled ? colors.brandPrimary : colors.textSecondary}
                            />
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <AppText weight="bold" variant="body">
                                {item.label}
                              </AppText>
                              {isProtectedCritical && (
                                <Badge label="Core Root Control" tone="warning" />
                              )}
                            </View>

                            <AppText tone="secondary" variant="caption" style={{ marginTop: 2, marginBottom: 6 }}>
                              {item.description}
                            </AppText>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Badge label={item.category} tone="neutral" />
                              <Badge
                                label={item.enabled ? 'Allowed' : 'Restricted'}
                                tone={item.enabled ? 'success' : 'critical'}
                              />
                            </View>
                          </View>
                        </View>

                        <View style={{ alignItems: 'center', gap: 4 }}>
                          <Switch
                            value={item.enabled}
                            onValueChange={() => handleTogglePermission(item)}
                            disabled={isProtectedCritical}
                            trackColor={{ false: colors.divider, true: colors.brandPrimary }}
                            thumbColor="#FFFFFF"
                          />
                          {isProtectedCritical && (
                            <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
                          )}
                        </View>
                      </View>
                    </SolidCard>
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState
              title="No permissions match your filter"
              description={`Try searching for different keywords or clear the category filter.`}
            />
          )}
        </ScrollView>
      </ScreenContainer>
    </SuperAdminGate>
  );
}
