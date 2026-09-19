import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar } from '@/components/FloatingLiquidGlassTabBar';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

export default function StaffLayout() {
 const { colors, isDark } = useTheme();
 const { isDesktop } = useResponsive();
 const { isFeatureEnabled } = useFeatureFlags();

 if (!isFeatureEnabled('staff_role')) {
   return <Redirect href="/(student)/dashboard" />;
 }

 const tabsContent = (
 <Tabs
 tabBar={(props) => <FloatingLiquidGlassTabBar {...props} />}
 screenOptions={{
 headerShown: false,
 tabBarStyle: isDesktop
 ? { display: 'none' }
 : {
 position: 'absolute',
 backgroundColor: 'transparent',
 borderTopWidth: 0,
 elevation: 0,
 height: 0,
 },
 tabBarActiveTintColor: colors.brandPrimary,
 tabBarInactiveTintColor: colors.tabInactive,
 tabBarLabelStyle: {
 fontSize: 11,
 fontWeight: '600',
 },
 }}
 >
  <Tabs.Screen
    name="dashboard"
    options={{
      title: 'Home',
      tabBarIcon: ({ focused, size }) => (
        <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} size={size} />
      ),
    }}
  />
  <Tabs.Screen
    name="announcements"
    options={{
      href: isFeatureEnabled('campus_announcements') ? undefined : null,
      title: 'Broadcasts',
      tabBarIcon: ({ focused, size }) => (
        <TabIcon name={focused ? 'megaphone' : 'megaphone-outline'} focused={focused} size={size} />
      ),
    }}
  />
  <Tabs.Screen
    name="moderation"
    options={{
      title: 'Moderation',
      tabBarIcon: ({ focused, size }) => (
        <TabIcon name={focused ? 'shield' : 'shield-outline'} focused={focused} size={size} />
      ),
    }}
  />
  <Tabs.Screen
    name="events-list"
    options={{
      href: isFeatureEnabled('campus_events') ? undefined : null,
      title: 'Events',
      tabBarIcon: ({ focused, size }) => (
        <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} size={size} />
      ),
    }}
  />
  <Tabs.Screen
    name="forum"
    options={{
      href: isFeatureEnabled('discussion_workspaces') ? undefined : null,
      title: 'Forum',
      tabBarIcon: ({ focused, size }) => (
        <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} size={size} />
      ),
    }}
  />

  {/* Reachable via header avatar / dashboard quick links, not bottom tabs. */}
  <Tabs.Screen name="events" options={{ href: null }} />
  <Tabs.Screen name="profile" options={{ href: null }} />
  <Tabs.Screen name="notifications" options={{ href: null }} />
  <Tabs.Screen name="search" options={{ href: null }} />
  <Tabs.Screen name="settings" options={{ href: null }} />
  <Tabs.Screen name="messages" options={{ href: null }} />
  <Tabs.Screen name="post/[id]" options={{ href: null }} />
  </Tabs>
 );

 return (
 <RoleGate allow="staff">
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
