import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MentorshipSpace } from '@/components/mentorship/MentorshipSpace';

export default function StudentMentorshipSpaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MentorshipSpace mentorshipId={String(id)} role="student" />;
}
