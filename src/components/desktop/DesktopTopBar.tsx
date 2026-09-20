import React, { useState, useEffect } from 'react';
import { View, Pressable, TextInput, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { PublishThreadModal } from '@/components/PublishThreadModal';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/notifications';
import { createPost } from '@/api/posts';
import { getMyProfile, markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import { isUnverifiedPersonalUser } from '@/utils/verificationGate';
import { ApplyForVerificationModal } from '@/components/ApplyForVerificationModal';
import { useFeatureFlags, FeatureKey } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
import { resolveNotificationRoute } from '@/utils/notificationRouter';

const RAW_QUICK_COMMANDS: { id: string; title: string; subtitle: string; icon: any; href: string; flagKey?: FeatureKey }[] = [
  { id: 'feed', title: 'Forum & Discussions', subtitle: 'Browse student threads, polls and queries', icon: 'chatbubbles-outline', href: '/(student)/feed', flagKey: 'discussion_workspaces' },
  { id: 'messages', title: 'Direct Messages & Chats', subtitle: 'Private 1-on-1 messages with peers and mentors', icon: 'chatbubble-ellipses-outline', href: '/(student)/messages', flagKey: 'e2ee_messaging' },
  { id: 'resources', title: 'Past Questions & Notes Library', subtitle: 'Search and download academic course materials', icon: 'folder-open-outline', href: '/(student)/resources', flagKey: 'academic_resources' },
  { id: 'marketplace', title: 'Campus Marketplace', subtitle: 'Buy/sell textbooks, electronics & lab coats', icon: 'cart-outline', href: '/(student)/marketplace', flagKey: 'marketplace' },
  { id: 'events', title: 'Events & Tech Hackathons', subtitle: 'Upcoming campus workshops, live streams & meetups', icon: 'calendar-outline', href: '/(student)/events-list', flagKey: 'campus_events' },
  { id: 'jobs', title: 'Job Opportunities & Internships', subtitle: 'Graduate roles and company referrals', icon: 'briefcase-outline', href: '/(student)/jobs', flagKey: 'career_page' },
  { id: 'mentorship', title: 'Mentorship & Class Reps', subtitle: 'Connect with alumni mentors & leaders', icon: 'people-outline', href: '/(student)/mentorship', flagKey: 'alumni_mentorship' },
  { id: 'study-groups', title: 'Study Pods & Circles', subtitle: 'Join exam revision groups for your cohort', icon: 'school-outline', href: '/(student)/study-groups', flagKey: 'study_groups' },
  { id: 'settings', title: 'Settings & Security', subtitle: 'Configure 2FA, campus theme & privacy', icon: 'settings-outline', href: '/(student)/settings' },
];

export function DesktopTopBar() {
 const { colors, isDark } = useTheme();
 const { user, switchRole } = useAuth();
  const { flags, isFeatureEnabled } = useFeatureFlags();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [composerOpen, setComposerOpen] = useState(false);
 const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);
 const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
 const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const isRestrictedGuest = isUnverifiedPersonalUser(profile);

  async function handleSubmitVerification(data: {
    institutionClaimed: string;
    documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: profile?.fullName ?? user.fullName,
        documentType: data.documentType,
        documentReference: data.documentReference,
        institutionClaimed: data.institutionClaimed,
        documentPhotoUri: data.documentPhotoUri,
        photoBlob: data.photoBlob,
      });
      markVerificationPending(user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setVerificationModalOpen(false);
      toast.success('Verification submitted! Campus moderators are reviewing your credentials.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit verification request. Please try again.');
    }
  }

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => listNotifications(),
    enabled: !!user?.id,
  });

 const unreadNotifications = (notifications ?? []).filter((n: any) => !n.isRead && !n.read);
 const unreadCount = unreadNotifications.length;
 const role = user?.role || 'student';
 const isSuperAdmin = user?.actualRole === 'admin';

 // Listen for global Cmd+K / Ctrl+K keyboard shortcut on web
  useEffect(() => {
    if (Platform.OS !== 'web') return;
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

 const handleSearchSubmit = () => {
 if (searchQuery.trim()) {
 router.push({
 pathname: `/(${role})/search` as any,
 params: { q: searchQuery.trim() },
 });
 } else {
 setCommandPaletteOpen(true);
 }
 };

 const filteredCommands = RAW_QUICK_COMMANDS.filter((item) => (item.flagKey ? isFeatureEnabled(item.flagKey) : true)).filter(
 (c) =>
 c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 c.subtitle.toLowerCase().includes(searchQuery.toLowerCase()),
 );

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: isDark ? 'rgba(10, 19, 38, 0.95)' : '#FFFFFF',
          borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)',
        },
      ]}
    >
      {/* Left: Global Search Bar (with Command+K hint) */}
      <Pressable
        onPress={() => setCommandPaletteOpen(true)}
        style={[
          styles.searchBar,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          },
        ]}
      >
        <Ionicons name="search" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
        <TextInput
          placeholder="Search campus discussions, courses, events..."
          accessibilityLabel="Search campus discussions, courses and events"
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
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
            },
          ]}
        >
          <AppText variant="caption" style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#64748B', fontWeight: 'bold' }}>
            {isMac ? '⌘K' : 'Ctrl K'}
          </AppText>
        </View>
      </Pressable>

 {/* Right Controls */}
 <View style={styles.rightSection}>

 {/* Role Switcher Dropdown - Root Admins only, see isSuperAdmin above */}
 {isSuperAdmin && (
 <View style={{ position: 'relative' }}>
 <Pressable
 onPress={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
 style={[
 styles.roleSwitchBtn,
 {
 backgroundColor: colors.divider,
 borderColor: colors.border,
 },
 ]}
 >
 <Ionicons name="eye-outline" size={14} color={colors.textSecondary} />
 <AppText variant="caption" weight="bold" tone="secondary" style={{ fontSize: 11 }}>
 View: {role.toUpperCase()}
 </AppText>
 <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
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
              {(['student', 'alumni', 'staff', 'admin'] as const)
                .filter((r) => r !== 'staff' || isFeatureEnabled('staff_role'))
                .map((r) => (
                <Pressable
                  key={r}
                  onPress={async () => {
                    setRoleSwitcherOpen(false);
                    await switchRole(r);
                    const targetDashboard = r === 'admin' ? '/(admin)/platform-config' : `/(${r})/dashboard`;
                    router.replace(targetDashboard as any);
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
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityState={{ expanded: notifDropdownOpen }}
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

              <ScrollView style={{ flex: 1, width: '100%',  maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {(notifications ?? []).slice(0, 5).map((n: any) => (
                  <Pressable
                    key={n.id}
                    onPress={async () => {
                      setNotifDropdownOpen(false);
                      if (!n.openedAt) {
                        await markNotificationRead(n.id);
                        queryClient.invalidateQueries({ queryKey: ['notifications'] });
                      }
                      const targetRoute = resolveNotificationRoute(n.deepLinkPath, n.type, role);
                      router.push(targetRoute as any);
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
                  router.push(`/(${role})/notifications` as any);
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

 </View>

 {/* Global Command Palette (⌘K) Modal */}
 <Modal visible={commandPaletteOpen} transparent animationType="fade" onRequestClose={() => setCommandPaletteOpen(false)}>
 <Pressable accessibilityViewIsModal accessible={false} importantForAccessibility="no"
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
 <Ionicons name="search" size={20} color={colors.textSecondary} />
 <TextInput accessibilityLabel="Type a command, course, thread or page to navigate"
 placeholder="Type a command, course, thread or page to navigate..."
 placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
 value={searchQuery}
 onChangeText={setSearchQuery}
 autoFocus
 style={{ flex: 1, fontSize: 15, color: isDark ? '#F8FAFC' : '#0F172A', outlineStyle: 'none' as any }}
 />
 <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setCommandPaletteOpen(false)} hitSlop={8}>
 <Ionicons name="close" size={20} color={isDark ? '#94A3B8' : '#64748B'} />
 </Pressable>
 </View>

 {/* Quick Actions List */}
 <ScrollView style={{ flex: 1, width: '100%',  maxHeight: 380, padding: 8 }} showsVerticalScrollIndicator={false}>
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
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name={cmd.icon as any} size={20} color={colors.textSecondary} />
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
                    if (isRestrictedGuest) {
                      setVerificationModalOpen(true);
                      return;
                    }
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
                authorInstitutionCode: profile?.institutionCode || 'GLOBAL',
              });
              await queryClient.invalidateQueries({ queryKey: ['feed'] });
              toast.success('Forum discussion published successfully!');
              setComposerOpen(false);
            }}
          />
        )}

        <ApplyForVerificationModal
          visible={verificationModalOpen}
          onClose={() => setVerificationModalOpen(false)}
          onSubmit={handleSubmitVerification}
          defaultInstitution={profile?.institutionCode}
        />
 </View>
 );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    zIndex: 20,
  },
  searchBar: {
    flex: 1,
    maxWidth: 500,
    minWidth: 180,
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    outlineStyle: 'none' as any,
  },
  shortcutBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
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
