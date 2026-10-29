import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AmbassadorGate } from '@/auth/AmbassadorGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar, FloatingLiquidGlassTabBarView } from '@/components/FloatingLiquidGlassTabBar';
import { BlurredTabsHost } from '@/components/BlurredTabsHost';

export default function AmbassadorLayout() {
  const { colors } = useTheme();
  const { isDesktop } = useResponsive();
  const tabs = (
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
            : { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0, height: 0 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Overview', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} size={size} /> }} />
        <Tabs.Screen name="discussions" options={{ title: 'Spaces', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? 'chatbubbles' : 'chatbubbles-outline'} focused={focused} size={size} /> }} />
        <Tabs.Screen name="events-list" options={{ title: 'Events', tabBarIcon: ({ focused, size }) => <TabIcon name={focused ? 'calendar' : 'calendar-outline'} focused={focused} size={size} /> }} />
        <Tabs.Screen name="student-portal" options={{ title: 'Student', tabBarIcon: ({ focused, size }) => <TabIcon name="school-outline" focused={focused} size={size} /> }} />
        {['profile', 'saved', 'search', 'notifications', 'settings', 'messages', 'events', 'post/[id]', 'forum/explore'].map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null }} />
        ))}
      </Tabs>
    </BlurredTabsHost>
  );
  return <AmbassadorGate>{isDesktop ? <DesktopShell>{tabs}</DesktopShell> : tabs}</AmbassadorGate>;
}

function TabIcon({ name, focused, size }: { name: keyof typeof Ionicons.glyphMap; focused: boolean; size: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: focused ? colors.pastelPrimaryBg : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size - 1} color={focused ? colors.brandPrimary : colors.tabInactive} />
    </View>
  );
}
