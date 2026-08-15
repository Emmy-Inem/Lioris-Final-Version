import React from'react';
import { Stack } from'expo-router';

export default function AlumniMessagesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index"options={{ headerShown: false }} />
      <Stack.Screen name="[id]"options={{ title: 'Conversation' }} />
    </Stack>
  );
}
