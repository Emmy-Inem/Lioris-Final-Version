import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { SolidCard } from '@/components/SolidCard';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { listReports } from '@/api/moderation';

const DEPARTMENTS = [
  { name: 'Computer Science', files: 4, ratings: 0 },
  { name: 'Electrical Engineering', files: 2, ratings: 0 },
  { name: 'Mathematics', files: 3, ratings: 0 },
];

const CHART_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STUDENT_SERIES = [10, 35, 68, 55, 82, 95];
const ALUMNI_SERIES = [62, 58, 68, 60, 78, 80];

export function AnalyticsTab() {
  const { colors, spacing, radius } = useTheme();
  const { data: openReports } = useQuery({ queryKey: ['reports', 'open'], queryFn: () => listReports({ status: 'open' }) });
  const totalFiles = DEPARTMENTS.reduce((sum, d) => sum + d.files, 0);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
        <SolidCard style={{ flex: 1 }}>
          <AppText tone="secondary" variant="caption">
            Ecosystem Nodes
          </AppText>
          <AppText variant="h2" weight="bold">
            7 Accounts
          </AppText>
        </SolidCard>
        <SolidCard style={{ flex: 1 }}>
          <AppText tone="secondary" variant="caption">
            Pending Flags
          </AppText>
          <AppText variant="h2" weight="bold" style={{ color: colors.success }}>
            {openReports?.length ?? 0} Unresolved
          </AppText>
        </SolidCard>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <AppText variant="h3" weight="bold">
          University Pulse Analytics 📊
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <SmallButton icon="download-outline" label="Export CSV" />
          <SmallButton icon="print-outline" label="Print PDF" />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md }}>
        <Legend color={colors.brandPrimary} label="Student DAU (5 active)" />
        <Legend color={colors.brandMagenta} label="Alumni DAU (0 active)" />
      </View>

      <SolidCard style={{ marginBottom: spacing.lg }}>
        <LineChart />
      </SolidCard>

      <SolidCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
          <Ionicons name="bar-chart" size={16} color={colors.brandPrimary} />
          <AppText weight="bold" style={{ flex: 1 }}>
            Resource & Departmental Rating Stats
          </AppText>
          <View style={{ backgroundColor: colors.divider, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
            <AppText variant="caption" weight="bold">
              {totalFiles} files
            </AppText>
          </View>
        </View>
        <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.md }}>
          Evaluation of academic resource indexing, engagement, and qualitative grading indices
          grouped by university department.
        </AppText>
        {DEPARTMENTS.map((dept) => (
          <View key={dept.name} style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <AppText weight="semiBold" variant="bodySmall">
                {dept.name}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={13} color="#F5A623" />
                <AppText weight="bold" variant="bodySmall">
                  {dept.ratings.toFixed(1)}
                </AppText>
              </View>
            </View>
            <AppText tone="secondary" variant="caption" style={{ marginBottom: 4 }}>
              {dept.files} files {'\u00b7'} {dept.ratings} ratings
            </AppText>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.divider }} />
          </View>
        ))}
      </SolidCard>
    </View>
  );
}

function SmallButton({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <Ionicons name={icon} size={12} color={colors.textSecondary} />
      <AppText variant="caption" weight="semiBold" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function LineChart() {
  const { colors } = useTheme();
  const width = 280;
  const height = 130;
  const padding = 10;

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
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = padding + (height - padding * 2) * (1 - pct / 100);
          return <Line key={pct} x1={padding} y1={y} x2={width - padding} y2={y} stroke={colors.divider} strokeWidth={1} />;
        })}
        <Polyline points={toPoints(STUDENT_SERIES)} fill="none" stroke={colors.brandPrimary} strokeWidth={2} />
        <Polyline points={toPoints(ALUMNI_SERIES)} fill="none" stroke={colors.brandMagenta} strokeWidth={2} />
        {dots(STUDENT_SERIES, colors.brandPrimary)}
        {dots(ALUMNI_SERIES, colors.brandMagenta)}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {CHART_DAYS.map((d) => (
          <AppText key={d} tone="secondary" variant="caption">
            {d}
          </AppText>
        ))}
      </View>
    </View>
  );
}
