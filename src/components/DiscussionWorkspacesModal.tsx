import React, { useEffect } from'react';
import { Modal, Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { router } from'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';

const CHANNELS = [
 { icon: 'megaphone'as const, label: 'All Academic Feed', pinned: true, unread: 0 },
 { icon: 'settings-outline'as const, label: 'Tech Hub', pinned: false, unread: 0 },
 { icon: 'home-outline'as const, label: 'Housing', pinned: false, unread: 3 },
 { icon: 'star-outline'as const, label: 'Social', pinned: false, unread: 0 },
 { icon: 'search-outline'as const, label: 'Lost & Found', pinned: false, unread: 1 },
];

interface DiscussionWorkspacesModalProps {
 visible: boolean;
 onClose: () => void;
}

/**
 * Ported from the"Discussion Workspaces"modal (Forum's hamburger-menu
 * icon). PRD Section 8 - real scale+fade entrance for the dialog
 * content rather than popping in instantly under RN Modal's native
 * backdrop fade (same treatment as AdminConfigModal).
 */
export function DiscussionWorkspacesModal({ visible, onClose }: DiscussionWorkspacesModalProps) {
 const { colors, spacing, radius } = useTheme();
 const { user } = useAuth();
 const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';
 const opacity = useSharedValue(0);
 const scale = useSharedValue(0.92);

 useEffect(() => {
 if (visible) {
 opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
 scale.value = withSpring(1, { damping: 16, stiffness: 220 });
 } else {
 opacity.value = 0;
 scale.value = 0.92;
 }
 }, [visible, opacity, scale]);

 const animatedStyle = useAnimatedStyle(() => ({
 opacity: opacity.value,
 transform: [{ scale: scale.value }],
 }));

 return (
 <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
 <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
 <Animated.View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '80%', width: '100%', maxWidth: 520 }, animatedStyle]}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h2" weight="bold">
 Discussion Workspaces
 </AppText>
 <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"accessibilityLabel="Close">
 <Ionicons name="close"size={22} color={colors.textPrimary} />
 </Pressable>
 </View>
 <View style={{ height: 1, backgroundColor: colors.divider, marginBottom: spacing.md }} />

 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
 WORKSPACES
 </AppText>
 <View
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 backgroundColor: colors.pastelPrimaryBg,
 borderRadius: radius.md,
 padding: spacing.md,
 marginBottom: spacing.lg,
 }}
 >
 <Ionicons name="school"size={16} color={colors.brandPrimary} />
 <AppText weight="semiBold"tone="brand">
 Student Academic Spaces 
 </AppText>
 </View>

 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
 CHANNELS
 </AppText>
 {CHANNELS.map((ch) => (
 <Pressable
 key={ch.label}
 onPress={onClose}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: spacing.sm,
 paddingVertical: spacing.sm,
 paddingHorizontal: ch.pinned ? spacing.md : 0,
 backgroundColor: ch.pinned ? colors.pastelPrimaryBg : 'transparent',
 borderRadius: radius.md,
 marginBottom: 2,
 }}
 >
 <Ionicons name={ch.icon} size={16} color={ch.pinned ? colors.brandPrimary : colors.textSecondary} />
 <AppText weight={ch.pinned ? 'semiBold' : 'regular'} tone={ch.pinned ? 'brand' : 'primary'} style={{ flex: 1 }}>
 {ch.label}
 </AppText>
 {ch.unread > 0 ? (
 <View
 style={{
 minWidth: 20,
 height: 20,
 borderRadius: 10,
 backgroundColor: colors.critical,
 alignItems: 'center',
 justifyContent: 'center',
 paddingHorizontal: 5,
 }}
 >
 <AppText variant="caption"weight="bold"tone="inverse">
 {ch.unread}
 </AppText>
 </View>
 ) : null}
 </Pressable>
 ))}

 {isStaffOrAdmin ? (
 <Pressable
 onPress={() => {
 onClose();
 router.push(user?.role === 'admin' ? '/(admin)/platform-config' : '/(staff)/moderation');
 }}
 accessibilityRole="button"accessibilityLabel="Open admin dashboard"style={{
 flexDirection: 'row',
 alignItems: 'center',
 justifyContent: 'center',
 gap: spacing.sm,
 backgroundColor: colors.roseBg,
 borderRadius: radius.md,
 paddingVertical: spacing.md,
 marginTop: spacing.lg,
 }}
 >
 <Ionicons name="shield"size={16} color={colors.roseText} />
 <AppText weight="bold"style={{ color: colors.roseText }}>
 Admin Dashboard
 </AppText>
 </Pressable>
 ) : null}
 </Animated.View>
 </View>
 </Modal>
 );
}
