import React from'react';
import { Stack } from'expo-router';

export default function OnboardingLayout() {
 return (
 // PRD Section 8 - deliberate"moving forward"motion for the linear
 // onboarding chain, explicit and consistent across iOS/Android
 // rather than left to each platform's differing default.
 <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
 <Stack.Screen name="choose-department" />
 <Stack.Screen name="select-interests" />
 <Stack.Screen name="upload-photo" />
 <Stack.Screen name="complete-profile" />
 <Stack.Screen name="browse-directory" />
 <Stack.Screen name="connect-classmates" />
 <Stack.Screen name="join-community" />
 <Stack.Screen name="join-event" />
 </Stack>
 );
}
