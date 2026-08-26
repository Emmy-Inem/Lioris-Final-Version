import React from'react';
import { View } from'react-native';
import { AppText } from'./AppText';
import { Badge } from'./Badge';
import { useTheme } from'@/theme/ThemeProvider';

interface HealthMetricBarProps {
 label: string;
 valuePct: number;
 greenMin: number;
 amberMin: number;
 /** If true, lower is better (e.g. false-positive rate) - bands are inverted. */
 invert?: boolean;
}

function bandFor(valuePct: number, greenMin: number, amberMin: number, invert?: boolean) {
 if (invert) {
 if (valuePct <= greenMin) return'green';
 if (valuePct <= amberMin) return'amber';
 return'red';
 }
 if (valuePct >= greenMin) return'green';
 if (valuePct >= amberMin) return'amber';
 return'red';
}

export function HealthMetricBar({ label, valuePct, greenMin, amberMin, invert }: HealthMetricBarProps) {
 const { colors, spacing, radius } = useTheme();
 const band = bandFor(valuePct, greenMin, amberMin, invert);

 const bandColor = { green: colors.success, amber: colors.warning, red: colors.critical }[band];
 const bandLabel = { green: 'On track', amber: 'Watch', red: 'At risk' }[band];
 const bandTone = { green: 'success', amber: 'warning', red: 'critical' } as const;

 return (
 <View style={{ marginBottom: spacing.lg }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs }}>
 <AppText weight="medium"variant="bodySmall">
 {label}
 </AppText>
 <Badge label={bandLabel} tone={bandTone[band]} />
 </View>
 <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.divider, overflow: 'hidden' }}>
 <View
 style={{
 width: `${Math.min(100, Math.max(0, valuePct))}%`,
 height: '100%',
 backgroundColor: bandColor,
 }}
 />
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginTop: spacing.xs }}>
 {valuePct}%
 </AppText>
 </View>
 );
}
