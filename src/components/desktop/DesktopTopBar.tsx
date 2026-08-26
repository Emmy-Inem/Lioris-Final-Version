import React, { useState, useEffect } from 'react';
import { View, Pressable, TextInput, StyleSheet, Modal, ScrollView } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from '@/hooks/useViewScope';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { PublishThreadModal } from '@/components/PublishThreadModal';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/notifications';
import { createPost } from '@/api/posts';

const QUICK_COMMANDS = [
  { id: 'feed', title: 'Campus Forum & Discussions', subtitle: 'Browse student threads, polls and queries', icon: 'chatbubbles-outline', href: '/(student)/feed' },
  { id: 'resources', title: 'Past Questions & Notes Library', subtitle: 'Search and download academic course materials', icon: 'folder-open-outline', href: '/(student)/resources' },
  { id: 'marketplace', title: 'Campus Marketplace', subtitle: 'Buy/sell textbooks, electronics & lab coats', icon: 'cart-outline', href: '/(student)/marketplace' },
  { id: 'events', title: 'Events & Tech Hackathons', subtitle: 'Upcoming campus workshops, live streams & meetups', icon: 'calendar-outline', href: '/(student)/events-list' },
  { id: 'jobs', title: 'Job Opportunities & Internships', subtitle: 'Graduate roles and company referrals', icon: 'briefcase-outline', href: '/(student)/jobs' },
  { id: 'mentorship', title: 'Mentorship & Class Reps', subtitle: 'Connect with alumni mentors & leaders', icon: 'people-outline', href: '/(student)/mentorship' },
  { id: 'study-groups', title: 'Study Pods & Circles', subtitle: 'Join exam revision groups for your cohort', icon: 'school-outline', href: '/(student)/study-groups' },
  { id: 'settings', title: 'Settings & Security', subtitle: 'Configure 2FA, campus theme & privacy', icon: 'settings-outline', href: '/(student)/settings' },
];

export function DesktopTopBar() {
  const { colors, isDark, radius, toggleTheme } = useTheme();
  const { user, switchRole } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { scope: viewScope, setScope: setViewScope } = useViewScope();
  const [composerOpen, setComposerOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => listNotifications(),
    enabled: !!user?.id,
  });

  const unreadNotifications = (notifications ?? []).filter((n: any) => !n.isRead && !n.read);
  const unreadCount = unreadNotifications.length;
  const role = user?.role || 'student';

  // Listen for global Cmd+K / Ctrl+K keyboard shortcut on web
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setNotifDropdownOpen(false);
        setRoleSwitcherOpen(false);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

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
      setCommandPaletteOpen(true);
    }
  };

  const filteredCommands = QUICK_COMMANDS.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subtitle.toLowerCase().includes(searchQuery.toLowerCase()),
  );

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AppText tone="secondary" variant="bodySmall" weight="medium">
            Lioris /
          </AppText>
          <AppText variant="h3" weight="bold">
            {getPageTitle()}
          </AppText>
        </View>
      </View>

      {/* Global Search Bar (with Command+K hint) */}
      <Pressable
        onPress={() => setCommandPaletteOpen(true)}
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
          placeholder="Search campus discussions, courses, events, past questions... (⌘K)"
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
          <AppText variant="caption" style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontWeight: 'bold' }}>
            ⌘K
          </AppText>
        </View>
      </Pressable>

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

        {/* Role Switcher Dropdown */}
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

        {/* Notifications Icon Button with Live Popover Dropdown */}
        <View style={{ position: 'relative' }}>
          <Pressable
            onPress={() => setNotifDropdownOpen(!notifDropdownOpen)}
            style={({ hovered }: any) => [
              styles.iconButton,
              {
                backgroundColor: hovered || notifDropdownOpen
                  ? isDark
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'rgba(0, 0, 0, 0.05)'
                  : 'transparent',
              },
            ]}
          >
            <Ionicons
              name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
              size={20}
              color={unreadCount > 0 ? colors.brandPrimary : isDark ? '#E2E8F0' : '#1E293B'}
            />
            {unreadCount > 0 && (
              <View style={[styles.notifBadge, { backgroundColor: colors.brandPrimary }]}>
                <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF', fontSize: 9 }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </AppText>
              </View>
            )}
          </Pressable>

          {/* Quick Notifications Popover */}
          {notifDropdownOpen && (
            <View
              style={[
                styles.notifDropdown,
                {
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }}>
                <AppText variant="bodySmall" weight="bold">Notifications</AppText>
                {unreadCount > 0 && (
                  <Pressable
                    onPress={async () => {
                      await markAllNotificationsRead();
                      queryClient.invalidateQueries({ queryKey: ['notifications'] });
                    }}
                  >
                    <AppText variant="caption" tone="brand" weight="semiBold">Mark all read</AppText>
                  </Pressable>
                )}
              </View>

              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {(notifications ?? []).slice(0, 5).map((n: any) => (
                  <Pressable
                    key={n.id}
                    onPress={async () => {
                      setNotifDropdownOpen(false);
                      if (!n.openedAt) {
                        await markNotificationRead(n.id);
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      }
                      if (n.deepLinkPath) {
                        router.push(n.deepLinkPath as any);
                      } else {
                        router.push(`/${role}/notifications` as any);
                      }
                    }}
                    style={({ hovered }: any) => [
                      styles.notifItem,
                      {
                        backgroundColor: !n.openedAt
                          ? isDark ? 'rgba(30, 136, 229, 0.08)' : 'rgba(30, 136, 229, 0.05)'
                          : hovered
                            ? isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC'
                            : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodySmall" weight={!n.openedAt ? 'bold' : 'medium'} numberOfLines={1}>
                        {n.title}
                      </AppText>
                      <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                        {n.message || n.body}
                      </AppText>
                    </View>
                    {!n.openedAt && <View style={styles.unreadDot} />}
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={() => {
                  setNotifDropdownOpen(false);
                  router.push(`/${role}/notifications` as any);
                }}
                style={{ paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  View All Notifications →
                </AppText>
              </Pressable>
            </View>
          )}
        </View>

        {/* Quick Composer Action Button */}
        <AppButton
          label="+ Post"
          variant="primary"
          onPress={() => setComposerOpen(true)}
        />
      </View>

      {/* Global Command Palette (⌘K) Modal */}
      <Modal visible={commandPaletteOpen} transparent animationType="fade" onRequestClose={() => setCommandPaletteOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          onPress={() => setCommandPaletteOpen(false)}
        >
          <Pressable
            style={{
              width: '100%',
              maxWidth: 620,
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0' }}>
              <Ionicons name="search" size={20} color={colors.brandPrimary} />
              <TextInput
                placeholder="Type a command, course, thread or page to navigate..."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                style={{ flex: 1, fontSize: 15, color: isDark ? '#F8FAFC' : '#0F172A', outlineStyle: 'none' as any }}
              />
              <Pressable onPress={() => setCommandPaletteOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </Pressable>
            </View>

            {/* Quick Actions List */}
            <ScrollView style={{ maxHeight: 380, padding: 8 }} showsVerticalScrollIndicator={false}>
              <AppText variant="caption" tone="secondary" weight="bold" style={{ paddingHorizontal: 12, paddingVertical: 6, textTransform: 'uppercase', fontSize: 10 }}>
                Quick Navigation & Workspaces
              </AppText>
              {filteredCommands.map((cmd) => (
                <Pressable
                  key={cmd.id}
                  onPress={() => {
                    setCommandPaletteOpen(false);
                    router.push(cmd.href as any);
                  }}
                  style={({ hovered }: any) => [
                    styles.paletteItem,
                    {
                      backgroundColor: hovered
                        ? isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9'
                        : 'transparent',
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      backgroundColor: colors.pastelPrimaryBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={cmd.icon as any} size={18} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodySmall" weight="bold">
                      {cmd.title}
                    </AppText>
                    <AppText variant="caption" tone="secondary">
                      {cmd.subtitle}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={isDark ? '#64748B' : '#94A3B8'} />
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="caption" tone="secondary">
                Navigation: <AppText weight="bold" variant="caption">↑ ↓ Enter</AppText> • Dismiss: <AppText weight="bold" variant="caption">Esc</AppText>
              </AppText>
              <Pressable
                onPress={() => {
                  setCommandPaletteOpen(false);
                  setComposerOpen(true);
                }}
              >
                <AppText variant="caption" weight="bold" tone="brand">
                  + Create Post
                </AppText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  notifDropdown: {
    position: 'absolute',
    top: 42,
    right: 0,
    width: 340,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    zIndex: 110,
    overflow: 'hidden',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1E88E5',
  },
  paletteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
});
