import React from'react';
import { View, Pressable } from'react-native';
import { router } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { SolidCard } from'./SolidCard';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { useTheme } from'@/theme/ThemeProvider';

const CHECKLIST = [
 'Complete your professional bio & expertise tags',
 'Engage with student queries in the public forum',
 'Accept incoming student connection invitations',
];

/** Ported from the"ALUMNI V1 WORKSPACE" / "Graduate Guild Lounge"card in DashboardScreen (DashboardAndProfile.kt). */
export function AlumniWorkspaceCard() {
 const { colors, spacing, radius } = useTheme();

 return (
 <SolidCard radius={20} style={{ marginBottom: spacing.lg, borderWidth: 1, borderColor: `${colors.brandMagenta}4D` }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="ribbon-outline"size={18} color={colors.brandMagenta} />
 <AppText variant="caption"weight="bold"style={{ color: colors.brandMagenta, letterSpacing: 1 }}>
 ALUMNI V1 WORKSPACE
 </AppText>
 </View>
 <Badge label="Verified Alumni"tone="accent" />
 </View>

 <AppText variant="h3"weight="bold"style={{ marginTop: spacing.sm }}>
 Welcome to the Graduate Guild Lounge 
 </AppText>
 <AppText tone="secondary"variant="bodySmall"style={{ marginTop: 4, marginBottom: spacing.md }}>
 Thank you for joining our professional alumni network. Complete your profile to guide
 current students as they begin their career journeys.
 </AppText>

 <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
 LEAN ONBOARDING STEPS
 </AppText>
 <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
 {CHECKLIST.map((item) => (
 <View key={item} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
 <Ionicons name="checkmark-circle"size={14} color={colors.success} />
 <AppText variant="bodySmall"style={{ flex: 1 }}>
 {item}
 </AppText>
 </View>
 ))}
 </View>

 <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
 <View style={{ flex: 1 }}>
 <Pressable
 onPress={() => router.push('/(alumni)/mentorship')}
 accessibilityRole="button"accessibilityLabel="Check pending mentorship requests"
 >
 <SolidCard radius={12}>
 <AppText variant="caption"tone="secondary">
 Pending Requests
 </AppText>
 <AppText tone="brand"weight="bold"variant="bodySmall">
 Check now ↗
 </AppText>
 </SolidCard>
 </Pressable>
 </View>
 <View style={{ flex: 1 }}>
 <SolidCard radius={12}>
 <AppText variant="caption"tone="secondary">
 Mentees Guided
 </AppText>
 <AppText weight="bold"variant="bodySmall"style={{ color: colors.success }}>
 1 undergrad
 </AppText>
 </SolidCard>
 </View>
 </View>
 </SolidCard>
 );
}
