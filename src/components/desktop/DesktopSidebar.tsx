import React, { useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useViewScope } from '@/hooks/useViewScope';
import { useFeatureFlags, FeatureKey } from '@/context/FeatureFlagsContext';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { LiorisLogo } from '@/components/LiorisLogo';
import { getMyProfile } from '@/api/profile';
import { listConversations } from '@/api/messaging';
import { listNotifications } from '@/api/notifications';

interface NavItem {
 id: string;
 label: string;
 href: string;
 icon: keyof typeof Ionicons.glyphMap;
 badgeCount?: number;
}

export function DesktopSidebar() {
 const { colors, isDark, toggleTheme, spacing, radius } = useTheme();
 const { user, logout } = useAuth();
 const { scope: viewScope, setScope: setViewScope } = useViewScope();
 const pathname = usePathname();
 const [collapsed, setCollapsed] = useState(false);

 const { data: profile } = useQuery({
 queryKey: ['profile', 'me', user?.id],
 queryFn: () => getMyProfile(user!),
 enabled: !!user,
 });

 const { data: conversations } = useQuery({
 queryKey: ['conversations', user?.id],
 queryFn: () => listConversations(),
 enabled: !!user?.id,
 });

 const { data: notifications } = useQuery({
 queryKey: ['notifications', user?.id],
 queryFn: () => listNotifications(),
 enabled: !!user?.id,
 });

 const unreadMessagesCount = (conversations ?? []).reduce(
 (acc: number, c: any) => acc + (c.unreadCount || 0),
 0,
 );
 const unreadNotificationsCount = (notifications ?? []).filter(
 (n: any) => !n.isRead && !n.read,
 ).length;

 const role = user?.role || 'student';

  const { flags, isFeatureEnabled } = useFeatureFlags();

  const rawStudentNavItems: (NavItem & { flagKey?: FeatureKey })[] = [
    { id: 'home', label: 'Dashboard', href: '/(student)/dashboard', icon: 'home' },
    { id: 'forum', label: 'Campus Forum', href: '/(student)/feed', icon: 'chatbubbles' },
    { id: 'events', label: 'Events Hub', href: '/(student)/events-list', icon: 'calendar', flagKey: 'campus_events' },
    { id: 'resources', label: 'Resources Library', href: '/(student)/resources', icon: 'folder-open', flagKey: 'academic_resources' },
    { id: 'marketplace', label: 'Marketplace', href: '/(student)/marketplace', icon: 'cart', flagKey: 'marketplace' },
    { id: 'jobs', label: 'Opportunities', href: '/(student)/jobs', icon: 'briefcase', flagKey: 'career_page' },
    { id: 'mentorship', label: 'Mentorship Hub', href: '/(student)/mentorship', icon: 'people', flagKey: 'alumni_mentorship' },
    { id: 'study-groups', label: 'Study Groups', href: '/(student)/study-groups', icon: 'school', flagKey: 'study_groups' },
    { id: 'calendar', label: 'Calendar & Schedule', href: '/(student)/calendar', icon: 'calendar-outline', flagKey: 'utility_cards' },
    { id: 'messages', label: 'Messages', href: '/(student)/messages', icon: 'chatbubble-ellipses', badgeCount: unreadMessagesCount, flagKey: 'e2ee_messaging' },
    { id: 'notifications', label: 'Notifications', href: '/(student)/notifications', icon: 'notifications', badgeCount: unreadNotificationsCount },
    { id: 'profile', label: 'My Academic Profile', href: '/(student)/profile', icon: 'person' },
    { id: 'settings', label: 'Settings & Security', href: '/(student)/settings', icon: 'settings' },
  ];

  const rawAlumniNavItems: (NavItem & { flagKey?: FeatureKey })[] = [
    { id: 'home', label: 'Alumni Home', href: '/(alumni)/dashboard', icon: 'home' },
    { id: 'forum', label: 'Global Forum', href: '/(alumni)/forum', icon: 'chatbubbles' },
    { id: 'events', label: 'Alumni Events', href: '/(alumni)/events', icon: 'calendar', flagKey: 'campus_events' },
    { id: 'mentorship', label: 'Mentor Students', href: '/(alumni)/mentorship', icon: 'ribbon', flagKey: 'alumni_mentorship' },
    { id: 'marketplace', label: 'Marketplace', href: '/(alumni)/marketplace', icon: 'cart', flagKey: 'marketplace' },
    { id: 'jobs', label: 'Post / Find Jobs', href: '/(alumni)/jobs', icon: 'briefcase', flagKey: 'career_page' },
    { id: 'messages', label: 'Messages', href: '/(alumni)/messages', icon: 'chatbubble-ellipses', badgeCount: unreadMessagesCount, flagKey: 'e2ee_messaging' },
    { id: 'notifications', label: 'Notifications', href: '/(alumni)/notifications', icon: 'notifications', badgeCount: unreadNotificationsCount },
    { id: 'profile', label: 'My Alumni Profile', href: '/(alumni)/profile', icon: 'person' },
    { id: 'settings', label: 'Settings', href: '/(alumni)/settings', icon: 'settings' },
  ];

  const studentNavItems = rawStudentNavItems.filter((item) => (item.flagKey ? isFeatureEnabled(item.flagKey) : true));
  const alumniNavItems = rawAlumniNavItems.filter((item) => (item.flagKey ? isFeatureEnabled(item.flagKey) : true));

 const rawStaffNavItems: (NavItem & { flagKey?: FeatureKey })[] = [
 { id: 'home', label: 'Staff Console', href: '/(staff)/dashboard', icon: 'home' },
 { id: 'forum', label: 'Faculty Forum', href: '/(staff)/forum', icon: 'chatbubbles' },
 { id: 'announcements', label: 'Broadcasts', href: '/(staff)/announcements', icon: 'megaphone' },
 { id: 'moderation', label: 'Moderation Desk', href: '/(staff)/moderation', icon: 'shield-checkmark' },
 { id: 'events', label: 'Campus Events', href: '/(staff)/events', icon: 'calendar', flagKey: 'campus_events' },
 { id: 'messages', label: 'Direct Messages', href: '/(staff)/messages', icon: 'chatbubble-ellipses', badgeCount: unreadMessagesCount, flagKey: 'e2ee_messaging' },
 { id: 'notifications', label: 'Staff Alerts', href: '/(staff)/notifications', icon: 'notifications', badgeCount: unreadNotificationsCount },
 { id: 'profile', label: 'Faculty Profile', href: '/(staff)/profile', icon: 'person' },
 { id: 'settings', label: 'Console Settings', href: '/(staff)/settings', icon: 'settings' },
 ];

  const staffNavItems = rawStaffNavItems.filter((item) => (item.flagKey ? isFeatureEnabled(item.flagKey) : true));

  const adminNavItems: (NavItem & { flagKey?: FeatureKey })[] = [
    { id: 'platform-config', label: 'Admin Command Desk', href: '/(admin)/platform-config', icon: 'shield' },
    { id: 'home', label: 'Executive Dashboard', href: '/(admin)/dashboard', icon: 'pie-chart' },
    { id: 'user-directory', label: 'User Directory', href: '/(admin)/user-directory', icon: 'people' },
    { id: 'verification-requests', label: 'Student Verifications', href: '/(admin)/verification-requests', icon: 'checkmark-done-circle' },
    { id: 'moderation-queue', label: 'Moderation Queue', href: '/(admin)/moderation-queue', icon: 'flag' },
    { id: 'audit-logs', label: 'Security Audit Logs', href: '/(admin)/audit-logs', icon: 'key' },
    { id: 'super-admin-config', label: 'System Configuration', href: '/(admin)/super-admin-config', icon: 'construct' },
    { id: 'forum', label: 'Campus Forum', href: '/(admin)/forum', icon: 'chatbubbles' },
    { id: 'messages', label: 'Messages', href: '/(admin)/messages', icon: 'chatbubble-ellipses', badgeCount: unreadMessagesCount, flagKey: 'e2ee_messaging' },
    { id: 'notifications', label: 'Alerts', href: '/(admin)/notifications', icon: 'notifications', badgeCount: unreadNotificationsCount },
    { id: 'settings', label: 'Settings', href: '/(admin)/settings', icon: 'settings' },
  ];

  const navItems: (NavItem & { flagKey?: FeatureKey })[] =
    role === 'admin'
      ? adminNavItems
      : role === 'staff'
      ? staffNavItems
      : role === 'alumni'
      ? alumniNavItems
      : studentNavItems;

 const campusName = profile?.institutionName ?? 'University of Ibadan';

 return (
 <View
 style={[
 styles.sidebar,
 {
 width: collapsed ? 74 : 260,
 backgroundColor: isDark ? 'rgba(10, 19, 38, 0.95)' : '#FFFFFF',
 borderRightColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
 },
 ]}
 >
 {/* Brand & Logo Header */}
 <View style={[styles.brandHeader, { paddingHorizontal: collapsed ? 12 : 16 }]}>
 <View style={[styles.logoRow, { justifyContent: collapsed ? 'center' : 'space-between' }]}>
        <Pressable
          onPress={() => router.push(role === 'admin' ? ('/(admin)/platform-config' as any) : (`/(${role})/dashboard` as any))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
 <LiorisLogo size={36} variant="symbol" />
 {!collapsed && (
 <View>
 <LiorisLogo size={18} variant="wordmark" />
 <AppText variant="caption" tone="secondary" style={{ marginTop: 2, fontSize: 11 }}>
 Campus Workspace
 </AppText>
 </View>
 )}
 </Pressable>

 <Pressable
 onPress={() => setCollapsed(!collapsed)}
 accessibilityRole="button"
 accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
 style={({ hovered }: any) => [
 styles.collapseBtn,
 {
 backgroundColor: hovered
 ? isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons
 name={collapsed ? 'chevron-forward' : 'chevron-back'}
 size={18}
 color={isDark ? '#94A3B8' : '#64748B'}
 />
 </Pressable>
 </View>

 {/* Active Campus Scope Pill & Scope Switcher */}
 {!collapsed && (
 <View style={{ gap: 6, marginTop: 4 }}>
 <View
 style={[
 styles.campusPill,
 {
 backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC',
 borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
 },
 ]}
 >
 <View style={styles.activeDot} />
 <AppText variant="caption" weight="semiBold" numberOfLines={1} style={{ flex: 1, fontSize: 11 }}>
 {campusName}
 </AppText>
 </View>

 {/* Scope Segment */}
 <View
 style={{
 flexDirection: 'row',
 backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
 borderRadius: 6,
 padding: 2,
 borderWidth: 1,
 borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0',
 }}
 >
 <Pressable
 onPress={() => setViewScope('campus')}
 style={{
 flex: 1,
 paddingVertical: 3,
 alignItems: 'center',
 borderRadius: 4,
 backgroundColor: viewScope === 'campus' ? colors.brandPrimary : 'transparent',
 }}
 >
 <AppText
 variant="caption"
 weight={viewScope === 'campus' ? 'bold' : 'medium'}
 style={{
 fontSize: 10,
 color: viewScope === 'campus' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
 }}
 >
 My Campus
 </AppText>
 </Pressable>
 <Pressable
 onPress={() => setViewScope('global')}
 style={{
 flex: 1,
 paddingVertical: 3,
 alignItems: 'center',
 borderRadius: 4,
 backgroundColor: viewScope === 'global' ? colors.brandPrimary : 'transparent',
 }}
 >
 <AppText
 variant="caption"
 weight={viewScope === 'global' ? 'bold' : 'medium'}
 style={{
 fontSize: 10,
 color: viewScope === 'global' ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
 }}
 >
 Global Feed
 </AppText>
 </Pressable>
 </View>
 </View>
 )}
 </View>

 {/* Navigation List */}
 <ScrollView
 showsVerticalScrollIndicator={false}
 contentContainerStyle={{ paddingVertical: spacing.sm, paddingHorizontal: collapsed ? 8 : spacing.sm }}
 style={{ flex: 1 }}
 >
 {!collapsed && (
 <AppText
 variant="caption"
 weight="bold"
 tone="secondary"
 style={{ paddingHorizontal: spacing.sm, marginBottom: spacing.xs, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.8 }}
 >
 Navigation
 </AppText>
 )}

        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== `/(${role})/dashboard` && item.href !== '/(admin)/platform-config' && pathname.startsWith(item.href));
          return (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.href as any)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ hovered }: any) => [
                styles.navButton,
                {
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  paddingHorizontal: collapsed ? 0 : 12,
                  paddingVertical: collapsed ? 12 : 9,
                  backgroundColor: isActive
                    ? colors.brandPrimary
                    : hovered
                    ? isDark
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.05)'
                    : 'transparent',
                  borderRadius: radius.md,
                },
              ]}
            >
              <View style={{ position: 'relative' }}>
                <Ionicons
                  name={item.icon}
                  size={19}
                  color={isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B'}
                />
                {collapsed && item.badgeCount && item.badgeCount > 0 ? (
                  <View style={styles.miniBadgeDot} />
                ) : null}
              </View>

              {!collapsed && (
                <AppText
                  variant="bodySmall"
                  weight={isActive ? 'bold' : 'medium'}
                  style={{
                    flex: 1,
                    color: isActive ? '#FFFFFF' : isDark ? '#E2E8F0' : '#1E293B',
                  }}
                >
                  {item.label}
                </AppText>
              )}

              {!collapsed && item.badgeCount && item.badgeCount > 0 ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isActive ? '#FFFFFF' : colors.brandPrimary,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    style={{
                      color: isActive ? colors.brandPrimary : '#FFFFFF',
                      fontSize: 10,
                    }}
                  >
                    {item.badgeCount > 99 ? '99+' : item.badgeCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* User Profile Footer */}
      <View
        style={[
          styles.footer,
          {
            flexDirection: collapsed ? 'column' : 'row',
            alignItems: 'center',
            gap: collapsed ? 10 : 0,
            padding: collapsed ? 10 : 12,
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          },
        ]}
      >
        <Pressable
          onPress={() => router.push(`/(${role})/profile` as any)}
          style={[styles.userCard, { justifyContent: collapsed ? 'center' : 'flex-start' }]}
        >
 <Avatar
 name={user?.fullName || 'User'}
 uri={profile?.avatarUrl}
 size={collapsed ? 34 : 38}
 />
 {!collapsed && (
 <View style={{ flex: 1, marginLeft: spacing.xs }}>
 <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
 {user?.fullName || 'Campus Member'}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
 <View
 style={{
 paddingHorizontal: 6,
 paddingVertical: 1,
 borderRadius: 4,
 backgroundColor: colors.pastelPrimaryBg,
 }}
 >
 <AppText
 variant="caption"
 weight="bold"
 tone="brand"
 style={{ fontSize: 9, textTransform: 'capitalize' }}
 >
 {role}
 </AppText>
 </View>
 <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 11, flex: 1 }}>
 {profile?.department || 'Member'}
 </AppText>
 </View>
 </View>
 )}
 </Pressable>

 <View style={[styles.footerControls, { flexDirection: collapsed ? 'column' : 'row' }]}>
 <Pressable
 onPress={toggleTheme}
 accessibilityRole="button"
 accessibilityLabel="Toggle Theme"
 style={({ hovered }: any) => [
 styles.iconBtn,
 {
 backgroundColor: hovered
 ? isDark
 ? 'rgba(255,255,255,0.1)'
 : 'rgba(0,0,0,0.06)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons
 name={isDark ? 'sunny' : 'moon'}
 size={18}
 color={isDark ? '#FCD34D' : '#475569'}
 />
 </Pressable>

 <Pressable
 onPress={async () => {
 await logout();
 router.replace('/(auth)/login');
 }}
 accessibilityRole="button"
 accessibilityLabel="Log out"
 style={({ hovered }: any) => [
 styles.iconBtn,
 {
 backgroundColor: hovered
 ? 'rgba(239, 68, 68, 0.12)'
 : 'transparent',
 },
 ]}
 >
 <Ionicons name="log-out-outline" size={18} color="#EF4444" />
 </Pressable>
 </View>
 </View>
 </View>
 );
}

const styles = StyleSheet.create({
 sidebar: {
 height: '100%',
 borderRightWidth: 1,
 display: 'flex',
 flexDirection: 'column',
 transitionProperty: 'width' as any,
 transitionDuration: '200ms' as any,
 },
 brandHeader: {
 paddingVertical: 14,
 borderBottomWidth: 1,
 borderBottomColor: 'rgba(150, 150, 150, 0.12)',
 },
 logoRow: {
 flexDirection: 'row',
 alignItems: 'center',
 marginBottom: 8,
 },
 collapseBtn: {
 width: 28,
 height: 28,
 borderRadius: 6,
 alignItems: 'center',
 justifyContent: 'center',
 },
 campusPill: {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 paddingHorizontal: 10,
 paddingVertical: 5,
 borderRadius: 8,
 borderWidth: 1,
 marginTop: 4,
 },
 activeDot: {
 width: 7,
 height: 7,
 borderRadius: 4,
 backgroundColor: '#10B981',
 },
 navButton: {
 flexDirection: 'row',
 alignItems: 'center',
 gap: 12,
 marginVertical: 2,
 },
 badge: {
 paddingHorizontal: 6,
 paddingVertical: 2,
 borderRadius: 10,
 alignItems: 'center',
 justifyContent: 'center',
 minWidth: 18,
 },
 miniBadgeDot: {
 position: 'absolute',
 top: -2,
 right: -2,
 width: 8,
 height: 8,
 borderRadius: 4,
 backgroundColor: '#EF4444',
 borderWidth: 1,
 borderColor: '#FFFFFF',
 },
 footer: {
 borderTopWidth: 1,
 justifyContent: 'space-between',
 },
 userCard: {
 flexDirection: 'row',
 alignItems: 'center',
 },
 footerControls: {
 alignItems: 'center',
 gap: 2,
 },
 iconBtn: {
 width: 32,
 height: 32,
 borderRadius: 6,
 alignItems: 'center',
 justifyContent: 'center',
 },
});
