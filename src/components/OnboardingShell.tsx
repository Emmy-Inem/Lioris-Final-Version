import React from'react';
import { Pressable, ScrollView, View } from'react-native';
import { router } from'expo-router';
import { ScreenContainer } from'./ScreenContainer';
import { AppText } from'./AppText';
import { AuthHeroBackground } from'./AuthHeroBackground';
import { WaveCard } from'./WaveCard';
import { useTheme } from'@/theme/ThemeProvider';
import { useAuth } from'@/auth/AuthContext';
import { onboardingProgress } from'@/auth/onboardingSteps';

interface OnboardingShellProps {
 currentPath: string;
 title: string;
 subtitle?: string;
 children: React.ReactNode;
 footer: React.ReactNode;
}

// Visual-only redesign (hero + wave card, matching login/register/
// verify-mfa) - the prop interface is untouched, so all 8 onboarding
// step screens that use this shell needed zero changes.
export function OnboardingShell({ currentPath, title, subtitle, children, footer }: OnboardingShellProps) {
 const { spacing, radius } = useTheme();
 const { user, logout } = useAuth();
 const { step, total } = user ? onboardingProgress(user.role, currentPath) : { step: 1, total: 1 };

 return (
 <ScreenContainer noPadding glow={false}>
 <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl }}>
 <AuthHeroBackground height={110}>
 <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
 {Array.from({ length: total }).map((_, i) => (
 <View
 key={i}
 style={{
 flex: 1,
 height: 4,
 borderRadius: radius.pill,
 backgroundColor: i < step ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
 }}
 />
 ))}
 </View>
 <AppText tone="inverse"variant="caption"weight="semiBold"style={{ opacity: 0.85 }}>
 Step {step} of {total}
 </AppText>
 </View>
 </AuthHeroBackground>

 <WaveCard>
 <AppText variant="h1"weight="bold"style={{ marginBottom: spacing.xs }}>
 {title}
 </AppText>
 {subtitle ? (
 <AppText tone="secondary"style={{ marginBottom: spacing.xl }}>
 {subtitle}
 </AppText>
 ) : (
 <View style={{ marginBottom: spacing.lg }} />
 )}

 {children}

 <View style={{ marginTop: spacing.xl }}>{footer}</View>
 {user ? (
 <Pressable
 accessibilityRole="button"
 accessibilityLabel="Sign out and use a different account"
 onPress={async () => {
 await logout().catch(() => {});
 router.replace('/(auth)/login');
 }}
 style={{ alignSelf: 'center', paddingVertical: spacing.md, marginTop: spacing.md }}
 >
 <AppText tone="secondary" variant="caption">
 Signed up with the wrong email? Sign out
 </AppText>
 </Pressable>
 ) : null}
 </WaveCard>
 </ScrollView>
 </ScreenContainer>
 );
}
