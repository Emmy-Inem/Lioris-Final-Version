import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface GradientProgressBarProps {
  progress: number; // 0-1
  height?: number;
}

/** Ported from ProfileScreen's XP bar: a horizontal blue -> purple -> orange gradient fill. */
export function GradientProgressBar({ progress, height = 6 }: GradientProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: 'rgba(128,128,128,0.2)' }}>
      <LinearGradient
        colors={['#3B82F6', '#8B5CF6', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${clamped * 100}%`, height: '100%' }}
      />
    </View>
  );
}
