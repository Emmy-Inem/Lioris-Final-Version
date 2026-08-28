import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar } from '@/components/FloatingLiquidGlassTabBar';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

export default function StudentLayout() {
 const { colors, isDark } = useTheme();
 const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();

 const tabsContent = (
 <Tabs
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
 name="feed"options={{
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
 <Tabs.Screen name="mentorship"options={{ href: null }} />
 <Tabs.Screen name="notifications"options={{ href: null }} />
 <Tabs.Screen name="search"options={{ href: null }} />
 <Tabs.Screen name="marketplace"options={{ href: null }} />
 <Tabs.Screen name="jobs"options={{ href: null }} />
 <Tabs.Screen name="study-groups"options={{ href: null }} />
 <Tabs.Screen name="calendar"options={{ href: null }} />
 <Tabs.Screen name="settings"options={{ href: null }} />
 <Tabs.Screen name="messages"options={{ href: null }} />
 <Tabs.Screen name="post/[id]" options={{ href: null }} />
 <Tabs.Screen name="post" options={{ href: null }} />
 </Tabs>
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
