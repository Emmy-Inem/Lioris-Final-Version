import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';

// Bottom nav matches the reference app's staff/admin shared bar: Home,
// Forum, Messages, Admin Desk (MainActivity.kt's combined
// `userRoleClean == "admin" || userTypeClean == "staff"` branch).
export default function StaffLayout() {
  const { colors } = useTheme();

  return (
    <RoleGate allow="staff">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="forum"
          options={{ title: 'Forum', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="moderation"
          options={{ title: 'Admin Desk', tabBarIcon: ({ color, size }) => <Ionicons name="shield" color={color} size={size} /> }}
        />

        {/* Reachable via header avatar / dashboard quick links, not bottom tabs. */}
        <Tabs.Screen name="announcements" options={{ href: null }} />
        <Tabs.Screen name="events" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="search" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="messages" options={{ href: null }} />
      </Tabs>
    </RoleGate>
  );
}
