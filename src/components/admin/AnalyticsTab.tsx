import React, { useState } from'react';
import { Alert, Pressable, ScrollView, View } from'react-native';
import { useQuery } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import Svg, { Circle, Line, Polyline } from'react-native-svg';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { Badge } from'@/components/Badge';
import { useTheme } from'@/theme/ThemeProvider';
import { listReports } from'@/api/moderation';
import { listResources } from'@/api/resources';
import { listEvents } from'@/api/events';
import { listFeedPosts } from'@/api/posts';
import { haptics } from'@/utils/haptics';

const DEPARTMENTS = [
 { name: 'Computer Science & AI', files: 18, rating: 4.9, activeStudents: 420 },
 { name: 'Electrical Engineering', files: 12, rating: 4.7, activeStudents: 310 },
 { name: 'Mathematics & Statistics', files: 9, rating: 4.8, activeStudents: 220 },
 { name: 'Civil & Environmental', files: 6, rating: 4.5, activeStudents: 180 },
];

const TIMEFRAMES = ['7 Days', '30 Days', '90 Days', 'All Time'] as const;

const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SERIES_BY_TIMEFRAME: Record<(typeof TIMEFRAMES)[number], { students: number[]; alumni: number[] }> = {
 '7 Days': { students: [24, 45, 68, 85, 92, 78, 95], alumni: [18, 30, 42, 55, 60, 68, 72] },
 '30 Days': { students: [35, 50, 72, 60, 88, 90, 100], alumni: [22, 38, 48, 52, 64, 70, 80] },
 '90 Days': { students: [40, 60, 80, 75, 95, 88, 98], alumni: [25, 45, 55, 60, 75, 82, 85] },
 'All Time': { students: [50, 70, 85, 90, 96, 92, 100], alumni: [30, 50, 65, 70, 85, 88, 92] },
};

export function AnalyticsTab() {
 const { colors, spacing, radius } = useTheme();
 const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>('7 Days');

 const { data: openReports = [] } = useQuery({
 queryKey: ['reports', 'open'],
 queryFn: () => listReports({ status: 'open' }),
 });
 const { data: resources = [] } = useQuery({
 queryKey: ['resources', 'count'],
 queryFn: () => listResources(),
 });
 const { data: events = [] } = useQuery({
 queryKey: ['events', 'count'],
 queryFn: () => listEvents({}),
 });
 const { data: posts = [] } = useQuery({
 queryKey: ['posts', 'count'],
 queryFn: () => listFeedPosts({}),
 });

 function handleExport(format: 'CSV' | 'PDF') {
 haptics.medium();
 Alert.alert(
 `Export ${format} Summary`,
 `Campus analytics & activity metrics for ${timeframe} prepared for download.`,
 );
 }

 const series = SERIES_BY_TIMEFRAME[timeframe];

 return (
 <View>
 {/* Top 4 KPI Metrics */}
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
 <MetricCard
 label="Active Community Posts"value={String(posts.length)}
 growth="+18% this week"icon="chatbubbles-outline"
 />
 <MetricCard
 label="Library Resources"value={String(resources.length)}
 growth="+6 newly indexed"icon="document-text-outline"
 />
 <MetricCard
 label="Campus Events"value={String(events.length)}
 growth="5 upcoming"icon="calendar-outline"
 />
 <MetricCard
 label="Moderation Queue"value={String(openReports.length)}
 growth={openReports.length === 0 ? 'Queue clean' : `${openReports.length} pending`}
 icon="shield-outline"tone={openReports.length > 0 ? 'warning' : 'brand'}
 />
 </View>

 {/* Analytics Timeframe Header */}
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
 <AppText variant="h3"weight="bold">
 University Pulse Analytics
 </AppText>
 <View style={{ flexDirection: 'row', gap: spacing.xs }}>
 <Pressable
 onPress={() => handleExport('CSV')}
 style={{
 flexDirection: 'row',
 alignItems: 'center',
 gap: 4,
 borderWidth: 1,
 borderColor: colors.border,
 borderRadius: radius.md,
 paddingHorizontal: spacing.sm,
 paddingVertical: 5,
 }}
 >
 <Ionicons name="download-outline"size={13} color={colors.textSecondary} />
 <AppText variant="caption"weight="bold"tone="secondary">
 Export CSV
 </AppText>
 </Pressable>
 </View>
 </View>

 {/* Timeframe Selector Pills */}
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.xs, marginBottom: spacing.md }}
 style={{ flex: 1, minWidth: 0 }}
 >
 {TIMEFRAMES.map((t) => {
 const selected = timeframe === t;
 return (
 <Pressable
 key={t}
 onPress={() => {
 haptics.light();
 setTimeframe(t);
 }}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: 5,
 borderRadius: radius.pill,
 backgroundColor: selected ? colors.brandPrimary : colors.divider,
 }}
 >
 <AppText variant="caption"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
 {t}
 </AppText>
 </Pressable>
 );
 })}
 </ScrollView>

 {/* Legends */}
 <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md }}>
 <Legend color={colors.brandPrimary} label="Student DAU (Live)" />
 <Legend color={colors.brandMagenta} label="Alumni & Mentors (Live)" />
 </View>

 {/* Activity Chart Card */}
 <SolidCard frosted style={{ marginBottom: spacing.lg }}>
 <LineChart students={series.students} alumni={series.alumni} />
 </SolidCard>

 {/* Department Breakdown */}
 <SolidCard frosted>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
 <Ionicons name="school-outline"size={16} color={colors.brandPrimary} />
 <AppText weight="bold"style={{ flex: 1 }}>
 Department Engagement & Resources
 </AppText>
 </View>
 <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.md }}>
 Evaluation of academic resource uploads, active student cohort density, and faculty engagement.
 </AppText>

 {DEPARTMENTS.map((dept) => (
 <View key={dept.name} style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
 <AppText weight="semiBold"variant="bodySmall">
 {dept.name}
 </AppText>
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
 <Ionicons name="star"size={12} color="#F5A623" />
 <AppText weight="bold"variant="caption">
 {dept.rating.toFixed(1)}
 </AppText>
 </View>
 </View>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
 <AppText tone="secondary"variant="caption">
 {dept.files} files indexed • {dept.activeStudents} students
 </AppText>
 <AppText tone="brand"variant="caption"weight="bold">
 {Math.round((dept.activeStudents / 500) * 100)}% active
 </AppText>
 </View>
 <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' }}>
 <View
 style={{
 width: `${Math.round((dept.activeStudents / 500) * 100)}%`,
 height: '100%',
 borderRadius: 3,
 backgroundColor: colors.brandPrimary,
 }}
 />
 </View>
 </View>
 ))}
 </SolidCard>
 </View>
 );
}

function MetricCard({
 label,
 value,
 growth,
 icon,
 tone = 'brand',
}: {
 label: string;
 value: string;
 growth: string;
 icon: keyof typeof Ionicons.glyphMap;
 tone?: 'brand' | 'warning' | 'critical';
}) {
 const { colors, spacing, radius } = useTheme();
 return (
 <SolidCard radius={18} frosted style={{ flex: 1, minWidth: '47%', minHeight: 90, justifyContent: 'space-between' }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
 <AppText tone="secondary"variant="caption"numberOfLines={1} style={{ flex: 1, marginRight: 4 }}>
 {label}
 </AppText>
 <Ionicons name={icon} size={16} color={colors.brandPrimary} />
 </View>
 <View>
 <AppText variant="h2"weight="bold">
 {value}
 </AppText>
 <AppText tone={tone === 'critical' ? 'critical' : 'brand'} variant="caption"weight="bold"style={{ fontSize: 11 }}>
 {growth}
 </AppText>
 </View>
 </SolidCard>
 );
}

function Legend({ color, label }: { color: string; label: string }) {
 return (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
 <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
 <AppText variant="caption"tone="secondary">
 {label}
 </AppText>
 </View>
 );
}

function LineChart({ students, alumni }: { students: number[]; alumni: number[] }) {
 const { colors } = useTheme();
 const width = 290;
 const height = 130;
 const padding = 12;

 function toPoints(series: number[]) {
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 return series
 .map((v, i) => {
 const x = padding + (i / (series.length - 1)) * usableWidth;
 const y = padding + usableHeight - (v / 100) * usableHeight;
 return `${x},${y}`;
 })
 .join(' ');
 }

 function dots(series: number[], color: string) {
 const usableWidth = width - padding * 2;
 const usableHeight = height - padding * 2;
 return series.map((v, i) => {
 const x = padding + (i / (series.length - 1)) * usableWidth;
 const y = padding + usableHeight - (v / 100) * usableHeight;
 return <Circle key={i} cx={x} cy={y} r={3} fill={color} />;
 });
 }

 return (
 <View>
 <Svg width="100%"height={height} viewBox={`0 0 ${width} ${height}`}>
 {[0, 25, 50, 75, 100].map((pct) => {
 const y = padding + (height - padding * 2) * (1 - pct / 100);
 return <Line key={pct} x1={padding} y1={y} x2={width - padding} y2={y} stroke={colors.divider} strokeWidth={1} />;
 })}
 <Polyline points={toPoints(students)} fill="none"stroke={colors.brandPrimary} strokeWidth={2.5} />
 <Polyline points={toPoints(alumni)} fill="none"stroke={colors.brandMagenta} strokeWidth={2.5} />
 {dots(students, colors.brandPrimary)}
 {dots(alumni, colors.brandMagenta)}
 </Svg>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 }}>
 {CHART_DAYS.map((d) => (
 <AppText key={d} tone="secondary"variant="caption">
 {d}
 </AppText>
 ))}
 </View>
 </View>
 );
}
