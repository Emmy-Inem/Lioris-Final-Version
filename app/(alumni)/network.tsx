import React, { useMemo, useState } from 'react';
import { FlatList, View, TextInput, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { DirectoryCard } from '@/components/DirectoryCard';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { searchAlumniDirectory } from '@/api/connections';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/utils/haptics';

const INDUSTRY_OPTIONS = [
  'Software & Technology',
  'Finance & Banking',
  'Healthcare',
  'Education',
  'Engineering',
  'Oil & Gas',
  'Government & Public Policy',
  'Media & Communications',
  'Consulting',
  'Agriculture',
];

export default function AlumniNetworkScreen() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);

  const isEnabled = isFeatureEnabled('alumni_network');

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => current - i);
  }, []);

  const { data: alumniList, isLoading } = useQuery({
    queryKey: ['alumni', 'directory', searchQuery, selectedYear, selectedIndustry],
    queryFn: () =>
      searchAlumniDirectory({
        q: searchQuery.trim() || undefined,
        graduationYear: selectedYear ?? undefined,
        industry: selectedIndustry ?? undefined,
      }),
    enabled: isEnabled,
  });

  const hasActiveFilters = !!selectedYear || !!selectedIndustry;

  if (!isEnabled) {
    return (
      <ScreenContainer glow={false}>
        {!isDesktop && <AppHeader />}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <EmptyState
            icon="people-outline"
            title="Alumni Network Unavailable"
            description="The Alumni Network directory is currently disabled by university administration."
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer glow={false}>
      {!isDesktop && <AppHeader />}
      <View style={{ paddingTop: isDesktop ? spacing.xs : spacing.md, paddingBottom: spacing.sm }}>
        <AppText variant={isDesktop ? 'h1' : 'h2'} weight="bold">
          Alumni Network
        </AppText>
        <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 2 }}>
          Discover fellow alumni, network across industries, and expand your professional circle.
        </AppText>
      </View>

      {/* Search Input Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 10,
          marginBottom: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search alumni"
          placeholderTextColor={colors.textSecondary}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontSize: 14,
            padding: 0,
          }}
        />
        {searchQuery.length > 0 && (
          <Ionicons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
            onPress={() => setSearchQuery('')}
          />
        )}
      </View>

      {/* Filter chips: Class Year + Industry */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}
        style={{ flexGrow: 0, marginBottom: spacing.sm }}
      >
        {hasActiveFilters && (
          <Pressable
            onPress={() => {
              haptics.light();
              setSelectedYear(null);
              setSelectedIndustry(null);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="refresh" size={13} color={colors.critical} />
            <AppText variant="caption" weight="bold" style={{ color: colors.critical }}>
              Reset
            </AppText>
          </Pressable>
        )}
        {yearOptions.map((year) => {
          const active = selectedYear === year;
          return (
            <Pressable
              key={year}
              onPress={() => {
                haptics.light();
                setSelectedYear(active ? null : year);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.brandPrimary : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight={active ? 'bold' : 'regular'} tone={active ? 'inverse' : 'secondary'}>
                Class of {year}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}
        style={{ flexGrow: 0, marginBottom: spacing.md }}
      >
        {INDUSTRY_OPTIONS.map((industry) => {
          const active = selectedIndustry === industry;
          return (
            <Pressable
              key={industry}
              onPress={() => {
                haptics.light();
                setSelectedIndustry(active ? null : industry);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.pastelPrimaryBg : colors.surface,
                borderWidth: 1,
                borderColor: active ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight={active ? 'bold' : 'regular'} tone={active ? 'brand' : 'secondary'}>
                {industry}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={alumniList ?? []}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          key={isDesktop ? 'desktop-2-col' : 'mobile-1-col'}
          numColumns={isDesktop ? 2 : 1}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          contentContainerStyle={{ paddingBottom: isDesktop ? 60 : 130, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={isDesktop ? { flex: 1, minWidth: 0 } : undefined}>
              <DirectoryCard entry={item} />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No alumni found"
              description={searchQuery ? 'Try adjusting your search terms.' : 'No other alumni profiles are currently registered.'}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}
