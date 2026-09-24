import React from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopShell } from '@/components/desktop/DesktopShell';
import { FloatingLiquidGlassTabBar, FloatingLiquidGlassTabBarView } from '@/components/FloatingLiquidGlassTabBar';
import { BlurredTabsHost } from '@/components/BlurredTabsHost';

export default function AdminLayout() {
  const { colors, isDark } = useTheme();
  const { isDesktop } = useResponsive();

  const tabsContent = (
    <BlurredTabsHost renderTabBar={(p, t) => <FloatingLiquidGlassTabBarView {...p} blurTarget={t} />}>
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
      }}
    >
      {/* The five groups (see src/components/admin/adminNav.ts). Each is one bottom tab; the pages
          inside a group are reached from the section pills at the top of the page. */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Overview',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="user-directory"
        options={{
          title: 'People',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="content-desk"
        options={{
          title: 'Content',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'layers' : 'layers-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="moderation-queue"
        options={{
          title: 'Safety',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'shield-checkmark' : 'shield-outline'} focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="platform-config"
        options={{
          title: 'Platform',
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name={focused ? 'settings' : 'settings-outline'} focused={focused} size={size} />
          ),
        }}
      />

      {/* Pages inside a group: not tabs themselves, but they keep their group's tab lit. */}
      <Tabs.Screen name="verification-requests" options={{ href: null, tabGroup: 'user-directory' } as any} />
      <Tabs.Screen name="support-desk" options={{ href: null, tabGroup: 'user-directory' } as any} />
      <Tabs.Screen name="takedown-requests" options={{ href: null, tabGroup: 'moderation-queue' } as any} />
      <Tabs.Screen name="audit-logs" options={{ href: null, tabGroup: 'moderation-queue' } as any} />
      <Tabs.Screen name="feature-controls" options={{ href: null, tabGroup: 'platform-config' } as any} />
      <Tabs.Screen name="super-admin-config" options={{ href: null, tabGroup: 'platform-config' } as any} />
      <Tabs.Screen name="system-health" options={{ href: null, tabGroup: 'platform-config' } as any} />
      <Tabs.Screen name="forum" options={{ href: null, tabGroup: 'content-desk' } as any} />
      <Tabs.Screen name="events-list" options={{ href: null, tabGroup: 'content-desk' } as any} />
      <Tabs.Screen name="events/[id]" options={{ href: null, tabGroup: 'content-desk' } as any} />
      <Tabs.Screen name="events" options={{ href: null, tabGroup: 'content-desk' } as any} />

      {/* Reached from the header (avatar, bell, messages) rather than the bottom bar. */}
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="post/[id]" options={{ href: null }} />
    </Tabs>
</BlurredTabsHost>
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
