import React, { useState } from 'react';
import { View, Pressable, TextInput, StyleSheet } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from '@/hooks/useViewScope';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { PublishThreadModal } from '@/components/PublishThreadModal';
import { listNotifications } from '@/api/notifications';
import { createPost } from '@/api/posts';

export function DesktopTopBar() {
  const { colors, isDark, radius } = useTheme();
  const { user, switchRole } = useAuth();
  const pathname = usePathname();
  const { scope: viewScope, setScope: setViewScope } = useViewScope();
  const [composerOpen, setComposerOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => listNotifications(),
    enabled: !!user?.id,
  });

  const unreadCount = (notifications ?? []).filter((n: any) => !n.isRead && !n.read).length;

  const role = user?.role || 'student';

  // Compute readable breadcrumb title from pathname
  const getPageTitle = () => {
    if (pathname.includes('/dashboard')) return 'Dashboard Overview';
    if (pathname.includes('/feed') || pathname.includes('/forum')) return 'Campus Forum';
    if (pathname.includes('/events')) return 'Events & Activities';
    if (pathname.includes('/resources')) return 'Academic Library';
    if (pathname.includes('/marketplace')) return 'Student Marketplace';
    if (pathname.includes('/jobs')) return 'Jobs & Internships';
    if (pathname.includes('/mentorship')) return 'Mentorship Hub';
    if (pathname.includes('/study-groups')) return 'Study Groups';
    if (pathname.includes('/messages')) return 'Direct Messages';
    if (pathname.includes('/notifications')) return 'Notifications & Alerts';
    if (pathname.includes('/profile')) return 'Academic Profile';
    if (pathname.includes('/settings')) return 'Settings & Privacy';
    if (pathname.includes('/user-directory')) return 'User Directory';
    if (pathname.includes('/verification-requests')) return 'Verification Requests';
    if (pathname.includes('/moderation')) return 'Moderation Desk';
    if (pathname.includes('/platform-config')) return 'Platform Configuration';
    if (pathname.includes('/alumni-hub')) return 'Alumni Network Hub';
    if (pathname.includes('/directory')) return 'Alumni Directory';
    return 'Lioris Campus';
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      router.push({
        pathname: `/${role}/search` as any,
        params: { q: searchQuery.trim() },
      });
    } else {
      router.push(`/${role}/search` as any);
    }
  };

  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: isDark ? 'rgba(10, 19, 38, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        },
      ]}
    >
      {/* Breadcrumb & Section Title */}
      <View style={styles.leftSection}>
        <AppText variant="h3" weight="bold">
          {getPageTitle()}
        </AppText>
      </View>

      {/* Global Search Bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
          },
        ]}
      >
        <Ionicons name="search" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
        <TextInput
          placeholder="Search campus threads, courses, events, classmates..."
          placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          style={[
            styles.searchInput,
            {
              color: isDark ? '#F8FAFC' : '#0F172A',
            },
          ]}
        />
        <View
          style={[
            styles.shortcutBadge,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
            },
          ]}
        >
          <AppText variant="caption" style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B' }}>
            ↵ Enter
          </AppText>
        </View>
      </View>

      {/* Right Controls */}
      <View style={styles.rightSection}>
        {/* Scope Pill Toggle */}
        <View
          style={[
            styles.scopeContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
            },
          ]}
        >
          <Pressable
            onPress={() => setViewScope('campus')}
            style={[
              styles.scopeTab,
              viewScope === 'campus' && {
                backgroundColor: colors.brandPrimary,
                borderRadius: 6,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight={viewScope === 'campus' ? 'bold' : 'medium'}
              style={{
                color: viewScope === 'campus' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                fontSize: 11,
              }}
            >
              My Campus
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => setViewScope('global')}
            style={[
              styles.scopeTab,
              viewScope === 'global' && {
                backgroundColor: colors.brandPrimary,
                borderRadius: 6,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight={viewScope === 'global' ? 'bold' : 'medium'}
              style={{
                color: viewScope === 'global' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
                fontSize: 11,
              }}
            >
              Inter-Campus
            </AppText>
          </Pressable>
        </View>

        {/* Admin/Staff Role Switcher Dropdown */}
        {(role === 'admin' || role === 'staff') && (
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
              style={[
                styles.roleSwitchBtn,
                {
                  backgroundColor: colors.pastelPrimaryBg,
                  borderColor: colors.brandPrimary,
                },
              ]}
            >
              <Ionicons name="eye-outline" size={14} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11 }}>
                View: {role.toUpperCase()}
              </AppText>
              <Ionicons name="chevron-down" size={12} color={colors.brandPrimary} />
            </Pressable>

            {roleSwitcherOpen && (
              <View
                style={[
                  styles.roleDropdown,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                  },
                ]}
              >
                {(['student', 'alumni', 'staff', 'admin'] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={async () => {
                      setRoleSwitcherOpen(false);
                      await switchRole(r);
                      router.replace(`/${r}/dashboard` as any);
                    }}
                    style={({ hovered }: any) => [
                      styles.dropdownItem,
                      hovered && {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                      },
                    ]}
                  >
                    <AppText
                      variant="bodySmall"
                      weight={role === r ? 'bold' : 'regular'}
                      style={{
                        color: role === r ? colors.brandPrimary : isDark ? '#E2E8F0' : '#1E293B',
                        textTransform: 'capitalize',
                      }}
                    >
                      {r} View
                    </AppText>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Notifications Icon Button */}
        <Pressable
          onPress={() => router.push(`/${role}/notifications` as any)}
          style={({ hovered }: any) => [
            styles.iconButton,
            {
              backgroundColor: hovered
                ? isDark
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)'
                : 'transparent',
            },
          ]}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={isDark ? '#E2E8F0' : '#1E293B'}
          />
          {unreadCount > 0 && (
            <View style={[styles.notifBadge, { backgroundColor: colors.brandPrimary }]}>
              <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF', fontSize: 9 }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </AppText>
            </View>
          )}
        </Pressable>

        {/* Quick Action Button */}
        <AppButton
          label="+ Post"
          variant="primary"
          onPress={() => setComposerOpen(true)}
        />
      </View>

      {/* Quick Composer Modal */}
      {composerOpen && (
        <PublishThreadModal
          visible={composerOpen}
          onClose={() => setComposerOpen(false)}
          onPublish={async (payload) => {
            if (!user) return;
            await createPost({
              ...payload,
            });
            setComposerOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 64,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    zIndex: 20,
  },
  leftSection: {
    minWidth: 160,
  },
  searchBar: {
    flex: 1,
    maxWidth: 480,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    outlineStyle: 'none' as any,
  },
  shortcutBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scopeContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 8,
  },
  scopeTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roleSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 140,
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    zIndex: 100,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
});
