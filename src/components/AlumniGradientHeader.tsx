import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { listNotifications } from '@/api/notifications';

export function AlumniGradientHeader() {
 const { colors, spacing, radius } = useTheme();
 const { user } = useAuth();

 const { data: notifications } = useQuery({
 queryKey: ['notifications', 'unread-count'],
 queryFn: () => listNotifications({ status: 'unread' }),
 });

 return (
 <View
 style={{
 backgroundColor: colors.surface,
 borderRadius: radius.lg,
 padding: spacing.lg,
 marginBottom: spacing.lg,
 borderWidth: 1,
 borderColor: colors.border,
 }}
 >
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <Pressable
 onPress={() => router.push('/(alumni)/profile')}
 style={{ flexDirection: 'row', gap: spacing.md, flex: 1 }}
 accessibilityRole="button"
 accessibilityLabel="Open profile"
 >
 <Avatar name={user?.fullName ?? 'Alum'} />
 <View style={{ flex: 1 }}>
 <AppText tone="secondary" variant="bodySmall">
 Welcome back
 </AppText>
 <AppText variant="h2" weight="bold" numberOfLines={1}>
 {user?.fullName ?? 'Alumni'}
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
 <Badge label="Verified Alumni" tone="brand" />
 </View>
 </View>
 </Pressable>

 <Pressable
 onPress={() => router.push('/(alumni)/notifications')}
 hitSlop={12}
 accessibilityRole="button"
 accessibilityLabel="Notifications"
 >
 <View>
 <Ionicons name="notifications-outline" size={24} color={colors.textPrimary} />
 {(notifications?.length ?? 0) > 0 ? (
 <View
 style={{
 position: 'absolute',
 top: -2,
 right: -2,
 width: 8,
 height: 8,
 borderRadius: 4,
 backgroundColor: colors.brandPrimary,
 }}
 />
 ) : null}
 </View>
 </Pressable>
 </View>
 </View>
 );
}
