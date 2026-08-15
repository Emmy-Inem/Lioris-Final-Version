import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ChatThread } from '@/components/ChatThread';

export default function StudentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <ScreenContainer edges={['bottom']}>
      <ChatThread conversationId={id} />
    </ScreenContainer>
  );
}
