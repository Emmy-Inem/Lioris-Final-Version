import React from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

interface GradientProgressBarProps {
 progress: number; // 0-1
 height?: number;
 color?: string;
}

/** Clean, solid progress bar for academic XP and course milestones. */
export function GradientProgressBar({ progress, height = 6, color }: GradientProgressBarProps) {
 const { colors } = useTheme();
 const clamped = Math.max(0, Math.min(1, progress));

 return (
 <View style={{ height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: colors.border }}>
 <View
 style={{
 width: `${clamped * 100}%`,
 height: '100%',
 backgroundColor: color || colors.brandPrimary,
 borderRadius: height / 2,
 }}
 />
 </View>
 );
}
