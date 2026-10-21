import React from'react';
import { Redirect, Stack } from'expo-router';
import { useAuth } from'@/auth/AuthContext';

export default function OnboardingLayout() {
 const { user, isLoading } = useAuth();
 // No session (expired / revoked refresh token, or the page was opened signed out): these forms cannot save
 // anything, so send the person to sign in instead of leaving them on a dead form.
 if (!isLoading && !user) return <Redirect href="/(auth)/login" />;
 return (
 // PRD Section 8 - deliberate"moving forward"motion for the linear
 // onboarding chain, explicit and consistent across iOS/Android
 // rather than left to each platform's differing default.
 <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
 <Stack.Screen name="join-waitlist" />
 <Stack.Screen name="build-profile" />
 <Stack.Screen name="guardian-details" />
 <Stack.Screen name="select-interests" />
 <Stack.Screen name="verify" />
 <Stack.Screen name="get-started" />
 </Stack>
 );
}
