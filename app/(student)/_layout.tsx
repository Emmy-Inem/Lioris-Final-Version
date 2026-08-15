import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoleGate } from '@/auth/RoleGate';
import { useTheme } from '@/theme/ThemeProvider';

// Bottom nav matches the confirmed student screenshots exactly: Home,
// Forum, Event, Library/Network. Messages removed for now per request.
export default function StudentLayout() {
  const { colors } = useTheme();

  return (
    <RoleGate allow="student">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarItemStyle: { paddingVertical: 4 },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="feed"
          options={{ title: 'Forum', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="events-list"
          options={{ title: 'Event', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }}
        />
        <Tabs.Screen
          name="resources"
          options={{ title: 'Library/Network', tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }}
        />

        {/* Reachable via header avatar / dashboard quick links, not bottom tabs. */}
        <Tabs.Screen name="events" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        <Tabs.Screen name="mentorship" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        <Tabs.Screen name="search" options={{ href: null }} />
        <Tabs.Screen name="marketplace" options={{ href: null }} />
        <Tabs.Screen name="jobs" options={{ href: null }} />
        <Tabs.Screen name="study-groups" options={{ href: null }} />
        <Tabs.Screen name="calendar" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        {/* Messages removed from nav for now, per request — routes kept so nothing 404s if linked elsewhere. */}
        <Tabs.Screen name="messages" options={{ href: null }} />
      </Tabs>
    </RoleGate>
  );
}
