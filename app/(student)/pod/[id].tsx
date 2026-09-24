import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PodSpace } from '@/components/pods/PodSpace';

export default function StudyPodRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PodSpace podId={String(id)} />;
}
