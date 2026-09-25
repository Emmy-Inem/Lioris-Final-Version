import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useAuth } from '@/auth/AuthContext';
import { useCampusScope } from '@/hooks/useCampusScope';
import { fetchCampusWeather, CampusWeather, CAMPUS_COORDINATES } from '@/api/weather';

interface CampusWeatherWidgetProps {
  campusCode?: string;
  onPressDetails?: () => void;
}

export function CampusWeatherWidget({ campusCode, onPressDetails }: CampusWeatherWidgetProps) {
  const { colors, spacing, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const { campusCode: scopedCampus, homeInstitutionCode } = useCampusScope();

  const effectiveCampus = (campusCode && campusCode !== 'GLOBAL')
    ? campusCode
    : (scopedCampus && scopedCampus !== 'GLOBAL')
    ? scopedCampus
    : (homeInstitutionCode && homeInstitutionCode !== 'GLOBAL')
    ? homeInstitutionCode
    : 'UNILAG';

  const [weather, setWeather] = useState<CampusWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampus, setSelectedCampus] = useState<string>(effectiveCampus);

  useEffect(() => {
    if (effectiveCampus && effectiveCampus !== selectedCampus) {
      setSelectedCampus(effectiveCampus);
    }
  }, [effectiveCampus]);

  const isEnabled = isFeatureEnabled('live_weather');

  useEffect(() => {
    if (!isEnabled) return;
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchCampusWeather(selectedCampus);
        if (mounted) setWeather(data);
      } catch (err) {
        console.warn('[CampusWeatherWidget] Error loading weather:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [isEnabled, selectedCampus]);

  if (!isEnabled) return null;

  function cycleCampus() {
    const keys = Object.keys(CAMPUS_COORDINATES);
    const currIdx = keys.indexOf(selectedCampus);
    const nextKey = keys[(currIdx + 1) % keys.length];
    setSelectedCampus(nextKey);
  }

  function getWeatherIcon(iconName?: string): keyof typeof Ionicons.glyphMap {
    switch (iconName) {
      case 'sunny':
        return 'sunny';
      case 'partly-sunny':
        return 'partly-sunny';
      case 'cloudy':
        return 'cloudy';
      case 'rainy':
        return 'rainy';
      case 'thunderstorm':
        return 'thunderstorm';
      default:
        return 'partly-sunny';
    }
  }

  return (
    <GlassCard
      radius={20}
      padded={false}
      style={{
        marginBottom: spacing.md,
      }}
      contentStyle={[
        styles.card,
        {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)',
        },
      ]}
    >
      {loading && !weather ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="small"
            color={colors.brandPrimary}
            accessibilityLabel="Loading live campus weather"
          />
          <AppText variant="caption" tone="secondary" style={{ marginLeft: spacing.xs }}>
            Loading live campus weather...
          </AppText>
        </View>
      ) : weather ? (
        <View>
          {/* Header: Campus location + Live status */}
          <View style={styles.headerRow}>
            <View style={styles.campusInfo}>
              <View style={[styles.pinIconWrap, { backgroundColor: colors.brandPrimary + '18' }]}>
                <Ionicons name="location" size={13} color={colors.brandPrimary} />
              </View>
              <AppText variant="caption" weight="bold" numberOfLines={1} style={{ marginLeft: 6, fontSize: 13, flexShrink: 1 }}>
                {weather.campus.name}
              </AppText>
              <Pressable
                onPress={cycleCampus}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Switch campus weather"
                style={[
                  styles.switchChip,
                  {
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.10)',
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.90)',
                    flexShrink: 0,
                  },
                ]}
              >
                <AppText variant="caption" weight="semiBold" tone="secondary" style={{ fontSize: 11 }}>
                  {weather.campus.shortName} ▾
                </AppText>
              </Pressable>
            </View>

            <View style={[styles.liveBadge, { backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.10)', borderColor: isDark ? 'rgba(34, 197, 94, 0.35)' : 'rgba(34, 197, 94, 0.25)', flexShrink: 0 }]}>
              <View style={styles.liveDot} />
              <AppText variant="caption" weight="bold" style={{ color: colors.success, fontSize: 11, letterSpacing: 0.5 }}>
                LIVE METEO
              </AppText>
            </View>
          </View>

          {/* Main Weather Metric Row */}
          <View style={styles.mainRow}>
            <View style={styles.leftTempCol}>
              <View style={styles.tempWithIcon}>
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor:
                        weather.iconName === 'sunny'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : weather.iconName === 'rainy' || weather.iconName === 'thunderstorm'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : isDark
                          ? 'rgba(148, 163, 184, 0.15)'
                          : 'rgba(100, 116, 139, 0.10)',
                    },
                  ]}
                >
                  <Ionicons
                    name={getWeatherIcon(weather.iconName)}
                    size={30}
                    color={
                      weather.iconName === 'sunny'
                        ? '#f59e0b'
                        : weather.iconName === 'rainy' || weather.iconName === 'thunderstorm'
                        ? '#3b82f6'
                        : colors.brandPrimary
                    }
                  />
                </View>
                <View>
                  <AppText variant="h1" weight="bold" style={styles.tempText}>
                    {weather.temperature}°<AppText style={{ fontSize: 18, fontWeight: '500', color: colors.textSecondary }}>C</AppText>
                  </AppText>
                  <AppText variant="caption" weight="semiBold" tone="secondary" style={{ marginTop: -2 }}>
                    {weather.condition} • Feels {weather.apparentTemperature}°C
                  </AppText>
                </View>
              </View>
            </View>
          </View>

          {/* Micro-metric Pills (Humidity, Precipitation, High/Low) */}
          <View style={styles.metricsGrid}>
            <View
              style={[
                styles.metricPill,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Ionicons name="water-outline" size={14} color={colors.brandPrimary} />
              <View style={{ marginLeft: 6 }}>
                <AppText variant="caption" weight="bold" style={{ fontSize: 12 }}>
                  {weather.humidity}%
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                  Humidity
                </AppText>
              </View>
            </View>

            <View
              style={[
                styles.metricPill,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Ionicons name="umbrella-outline" size={14} color="#3b82f6" />
              <View style={{ marginLeft: 6 }}>
                <AppText variant="caption" weight="bold" style={{ fontSize: 12 }}>
                  {weather.precipitationProbability}%
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                  Rain Chance
                </AppText>
              </View>
            </View>

            <View
              style={[
                styles.metricPill,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                },
              ]}
            >
              <Ionicons name="thermometer-outline" size={14} color="#f59e0b" />
              <View style={{ marginLeft: 6 }}>
                <AppText variant="caption" weight="bold" style={{ fontSize: 12 }}>
                  {weather.tempMax}° / {weather.tempMin}°
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
                  High / Low
                </AppText>
              </View>
            </View>
          </View>

          {/* Walking / Transit Advice Banner */}
          {weather.transitAdvice ? (
            <View
              style={[
                styles.adviceBox,
                {
                  backgroundColor: isDark ? 'rgba(124, 58, 237, 0.10)' : 'rgba(124, 58, 237, 0.06)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(167, 139, 250, 0.22)' : 'rgba(124, 58, 237, 0.16)',
                },
              ]}
            >
              <View style={styles.adviceContent}>
                <Ionicons name="footsteps-outline" size={14} color={colors.brandPrimary} style={{ marginTop: 1, marginRight: 6 }} />
                <AppText variant="caption" style={{ flex: 1, lineHeight: 16, color: colors.textPrimary, fontSize: 11.5 }}>
                  {weather.transitAdvice}
                </AppText>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  campusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  pinIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
    borderWidth: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  leftTempCol: {
    flex: 1,
    minWidth: 0,
  },
  tempWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempText: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metricPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  adviceBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  adviceContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
