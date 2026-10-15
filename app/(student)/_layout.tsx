import React from 'react';
import { Platform, View } from 'react-native';
import { Redirect, Tabs, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar, FloatingLiquidGlassTabBarView } from '@/components/FloatingLiquidGlassTabBar';
import { BlurredTabsHost } from '@/components/BlurredTabsHost';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

/** The module (admin feature flag) behind each student route. A disabled module must not be reachable by link. */
const ROUTE_FLAG: Record<string, string> = {
  feed: 'discussion_workspaces',
  forum: 'discussion_workspaces',
  post: 'discussion_workspaces',
  'events-list': 'campus_events',
  events: 'campus_events',
  resources: 'academic_resources',
  marketplace: 'marketplace',
  'marketplace-mine': 'marketplace',
  'study-groups': 'study_groups',
  pod: 'study_groups',
  mentorship: 'alumni_mentorship',
  'mentorship-space': 'alumni_mentorship',
  messages: 'e2ee_messaging',
  calendar: 'utility_cards',
};

export default function StudentLayout() {
 const { colors, isDark } = useTheme();
 const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const segments = useSegments();
  // Hiding a tab only hid the button: notification links, search results and typed URLs still opened the module.
  const routeFlag = ROUTE_FLAG[String((segments as string[])[1] ?? '')];
  if (routeFlag && !isFeatureEnabled(routeFlag as any)) {
    return <Redirect href="/(student)/dashboard" />;
  }

 const tabsContent = (
 <BlurredTabsHost renderTabBar={(p, t) => <FloatingLiquidGlassTabBarView {...p} blurTarget={t} />}>
<Tabs
  backBehavior="history"
  tabBar={(props) => <FloatingLiquidGlassTabBar {...props} />}
 screenOptions={{
 headerShown: false,
 tabBarActiveTintColor: colors.brandPrimary,
 tabBarInactiveTintColor: colors.tabInactive,
 tabBarStyle: isDesktop
          ? { display: 'none' }
          : {
              position: 'absolute',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
              height: 0,
            },
 tabBarLabelStyle: {
 fontSize: 11,
 fontWeight: '600',
 },
 }}
 >
 <Tabs.Screen
 name="dashboard"options={{
 title: 'Home',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} size={size} />
 ),
 }}
 />
 <Tabs.Screen
 name="feed" options={{
          href: isFeatureEnabled('discussion_workspaces') ? undefined : null,
 title: 'Forum',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} size={size} />
 ),
 }}
 />
 <Tabs.Screen
 name="events-list" options={{
          href: isFeatureEnabled('campus_events') ? undefined : null,
 title: 'Events',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} size={size} />
 ),
 }}
 />
 <Tabs.Screen
 name="resources" options={{
          href: isFeatureEnabled('academic_resources') ? undefined : null,
 title: 'Resources',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'folder' : 'folder-outline'} focused={focused} size={size} />
 ),
 }}
 />

 {/* Reachable via header avatar / dashboard quick links, not bottom tabs. */}
 <Tabs.Screen name="events"options={{ href: null }} />
 <Tabs.Screen name="profile"options={{ href: null }} />
 <Tabs.Screen name="saved" options={{ href: null }} />
 <Tabs.Screen name="mentorship"options={{ href: null }} />
 <Tabs.Screen name="mentorship-space/[id]" options={{ href: null }} />
 <Tabs.Screen name="pod/[id]" options={{ href: null }} />
 <Tabs.Screen name="notifications"options={{ href: null }} />
 <Tabs.Screen name="search"options={{ href: null }} />
 <Tabs.Screen name="marketplace"options={{ href: null }} />
 <Tabs.Screen name="marketplace-mine"options={{ href: null }} />
 <Tabs.Screen name="study-groups"options={{ href: null }} />
 <Tabs.Screen name="calendar"options={{ href: null }} />
 <Tabs.Screen name="settings"options={{ href: null }} />
 <Tabs.Screen name="messages"options={{ href: null }} />
 <Tabs.Screen name="post/[id]" options={{ href: null }} />
 <Tabs.Screen name="forum/explore" options={{ href: null }} />
 </Tabs>
</BlurredTabsHost>
 );

 return (
 <RoleGate allow="student">
 {isDesktop ? <DesktopShell>{tabsContent}</DesktopShell> : tabsContent}
 </RoleGate>
 );
}

function TabIcon({ name, focused, size }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; size: number }) {
 const { colors } = useTheme();
 return (
 <View
 style={{
 width: 38,
 height: 38,
 borderRadius: 19,
 backgroundColor: focused ? colors.pastelPrimaryBg : 'transparent',
 alignItems: 'center',
 justifyContent: 'center',
 }}
 >
 <Ionicons name={name} size={size - 1} color={focused ? colors.brandPrimary : colors.tabInactive} />
 </View>
 );
}
