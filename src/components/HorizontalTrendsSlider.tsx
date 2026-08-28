import React from'react';
import { Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';
import { useMockDataVisible } from '@/api/mockDataSettings';

const TRENDS = [
 { tag: 'CONVOCATION_2026', title: 'Convocation', count: '2.4K' },
 { tag: 'DEANS_CUP_FINALS', title: "Dean's Cup", count: '1.8K' },
 { tag: 'HOSTEL_TOWNHALL', title: 'Hostel Townhall', count: '3.2K' },
 { tag: 'CAMPUS_TECH_FEST', title: 'Tech Fest', count: '940' },
 { tag: 'LIORIS_VIRAL', title: 'Lioris Viral', count: '4.1K' },
];

interface HorizontalTrendsSliderProps {
 selectedTrend: string | null;
 onSelectTrend: (tag: string | null) => void;
}

/**
 * Ported from HorizontalTrendsSlider (DashboardAndProfile.kt): a filter-chip
 * row of trending campus topics. The tags/counts above have no real
 * trending-topics backend behind them - they're fixture data, so this only
 * renders while Mock Data Visibility is on (Settings -> Super Admin Config).
 */
export function HorizontalTrendsSlider({ selectedTrend, onSelectTrend }: HorizontalTrendsSliderProps) {
 const { colors, spacing, radius } = useTheme();
 const mockDataVisible = useMockDataVisible();

 if (!mockDataVisible) {
 return null;
 }

 return (
 <View style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <Ionicons name="flame"size={16} color="#EA580C" />
 <AppText variant="bodySmall"weight="bold">
 Trending Hot Topics
 </AppText>
 </View>
 {selectedTrend ? (
 <AppText variant="caption"weight="bold"tone="brand"onPress={() => onSelectTrend(null)}>
 Clear filter ×
 </AppText>
 ) : null}
 </View>

 <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 24, paddingBottom: 6 }}
        style={{ width: '100%', flexGrow: 0 }}
        {...({ dataSet: { horizontalScroll: 'true' } } as any)}
      >
 {TRENDS.map((trend) => {
 const selected = selectedTrend === trend.tag;
 return (
 <Pressable
 key={trend.tag}
 onPress={() => onSelectTrend(trend.tag)}
 accessibilityRole="button"accessibilityState={{ selected }}
 accessibilityLabel={trend.title}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 6,
 height: 36,
 paddingHorizontal: spacing.md,
 borderRadius: radius.lg,
 backgroundColor: selected ? colors.brandPrimary : colors.divider,
 borderWidth: selected ? 0 : 1,
 borderColor: colors.border,
 }}
 >
 <AppText variant="bodySmall"weight="bold"tone={selected ? 'inverse' : 'primary'}>
 {trend.title}
 </AppText>
 <AppText variant="caption"tone={selected ? 'inverse' : 'secondary'}>
 {trend.count}
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>
 </View>
 );
}
