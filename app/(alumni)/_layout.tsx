import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar } from '@/components/FloatingLiquidGlassTabBar';

export default function AlumniLayout() {
 const { colors, isDark } = useTheme();
 const { isDesktop } = useResponsive();

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
 name="alumni-hub"
 options={{
 title: 'Alumni Hub',
 tabBarIcon: ({ focused, size }) => (
 <TabIcon name={focused ? 'school' : 'school-outline'} focused={focused} size={size} />
 ),
 }}
 />

 {/* Reachable via header avatar / dashboard / Alumni Hub links, not bottom tabs. */}
 <Tabs.Screen name="events" options={{ href: null }} />
 <Tabs.Screen name="directory" options={{ href: null }} />
 <Tabs.Screen name="profile" options={{ href: null }} />
 <Tabs.Screen name="mentorship" options={{ href: null }} />
 <Tabs.Screen name="notifications" options={{ href: null }} />
 <Tabs.Screen name="search" options={{ href: null }} />
 <Tabs.Screen name="connection-requests" options={{ href: null }} />
 <Tabs.Screen name="marketplace" options={{ href: null }} />
 <Tabs.Screen name="jobs" options={{ href: null }} />
 <Tabs.Screen name="settings" options={{ href: null }} />
 <Tabs.Screen name="messages" options={{ href: null }} />
 <Tabs.Screen name="post/[id]" options={{ href: null }} />
 <Tabs.Screen name="post" options={{ href: null }} />
 </Tabs>
 );

 return (
 <RoleGate allow="alumni">
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
