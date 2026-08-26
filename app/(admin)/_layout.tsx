import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';

export default function AdminLayout() {
 const { colors, isDark } = useTheme();
 const { isDesktop } = useResponsive();

 const tabsContent = (
 <Tabs
 screenOptions={{
 headerShown: false,
 tabBarActiveTintColor: colors.brandPrimary,
 tabBarInactiveTintColor: colors.tabInactive,
 tabBarStyle: isDesktop
 ? { display: 'none' }
 : {
 backgroundColor: isDark ? 'rgba(10, 19, 38, 0.85)' : 'rgba(255, 255, 255, 0.88)',
 borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
 borderTopWidth: 1,
 height: 68,
 paddingBottom: 10,
 paddingTop: 8,
 ...(Platform.OS === 'web'
 ? ({
 backdropFilter: 'blur(24px)',
 WebkitBackdropFilter: 'blur(24px)',
 boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.06)',
 } as any)
 : {}),
 },
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
 name="forum"
 options={{
 title: 'Forum',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} size={size} />
 ),
 }}
 />
 <Tabs.Screen
 name="platform-config"
 options={{
 title: 'Admin Desk',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'shield' : 'shield-outline'} focused={focused} size={size} />
 ),
 }}
 />

 {/* Reachable via header avatar / dashboard quick links, not bottom tabs. */}
 <Tabs.Screen name="analytics" options={{ href: null }} />
 <Tabs.Screen name="super-admin-config" options={{ href: null }} />
 <Tabs.Screen name="moderation-queue" options={{ href: null }} />
 <Tabs.Screen name="reports" options={{ href: null }} />
 <Tabs.Screen name="feature-controls" options={{ href: null }} />
 <Tabs.Screen name="user-directory" options={{ href: null }} />
 <Tabs.Screen name="audit-logs" options={{ href: null }} />
 <Tabs.Screen name="moderation-audit-log" options={{ href: null }} />
 <Tabs.Screen name="verification-requests" options={{ href: null }} />
 <Tabs.Screen name="pulse-analytics" options={{ href: null }} />
 <Tabs.Screen name="profile" options={{ href: null }} />
 <Tabs.Screen name="notifications" options={{ href: null }} />
 <Tabs.Screen name="search" options={{ href: null }} />
 <Tabs.Screen name="settings" options={{ href: null }} />
 <Tabs.Screen name="messages" options={{ href: null }} />
 <Tabs.Screen name="events" options={{ href: null }} />
 <Tabs.Screen name="events/[id]" options={{ href: null }} />
 <Tabs.Screen name="post/[id]" options={{ href: null }} />
 <Tabs.Screen name="post" options={{ href: null }} />
 </Tabs>
 );

 return (
 <RoleGate allow="admin">
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
