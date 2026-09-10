import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useAuth } from '@/auth/AuthContext';
import { fetchCampusWeather, CampusWeather, CAMPUS_COORDINATES } from '@/api/weather';

interface CampusWeatherWidgetProps {
  campusCode?: string;
  onPressDetails?: () => void;
}

export function CampusWeatherWidget({ campusCode, onPressDetails }: CampusWeatherWidgetProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const { user } = useAuth();

  const [weather, setWeather] = useState<CampusWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampus, setSelectedCampus] = useState<string>(
    campusCode || (user as any)?.institutionCode || (user as any)?.institutionId || 'UI'
  );

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
    <SolidCard
      radius={20}
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          marginBottom: spacing.md,
        },
      ]}
    >
      {loading && !weather ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.brandPrimary} />
          <AppText variant="caption" tone="secondary" style={{ marginLeft: spacing.xs }}>
            Loading live campus weather...
          </AppText>
        </View>
      ) : weather ? (
        <View>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.campusInfo}>
              <Ionicons name="location" size={14} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" numberOfLines={1} style={{ marginLeft: 4 }}>
                {weather.campus.name}
              </AppText>
              <Pressable
                onPress={cycleCampus}
                hitSlop={8}
                style={[styles.switchChip, { backgroundColor: `${colors.brandPrimary}15` }]}
              >
                <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 10 }}>
                  {weather.campus.shortName} ▾
                </AppText>
              </Pressable>
            </View>
            <Badge label="LIVE METEO" tone="success" />
          </View>

          {/* Main Weather Metric Row */}
          <View style={styles.mainRow}>
            <View style={styles.leftTempCol}>
              <View style={styles.tempWithIcon}>
                <Ionicons
                  name={getWeatherIcon(weather.iconName)}
                  size={32}
                  color={weather.iconName === 'sunny' ? '#f59e0b' : colors.brandPrimary}
                />
                <AppText variant="h1" weight="bold" style={styles.tempText}>
                  {weather.temperature}°C
                </AppText>
              </View>
              <AppText variant="caption" weight="semiBold" tone="secondary">
                {weather.condition} • Feels {weather.apparentTemperature}°C
              </AppText>
            </View>

            <View style={styles.rightStatsCol}>
              <View style={styles.statItem}>
                <Ionicons name="water-outline" size={12} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={styles.statText}>
                  {weather.humidity}% Hum
                </AppText>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="umbrella-outline" size={12} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={styles.statText}>
                  {weather.precipitationProbability}% Rain
                </AppText>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="thermometer-outline" size={12} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={styles.statText}>
                  {weather.tempMax}° / {weather.tempMin}°
                </AppText>
              </View>
            </View>
          </View>

          {/* Walking / Transit Advice */}
          <View style={[styles.adviceBox, { backgroundColor: `${colors.brandPrimary}08` }]}>
            <AppText variant="caption" style={{ lineHeight: 16, color: colors.textPrimary }}>
              {weather.transitAdvice}
            </AppText>
          </View>
        </View>
      ) : null}
    </SolidCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  campusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  switchChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  leftTempCol: {
    flex: 1,
    minWidth: 0,
  },
  tempWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tempText: {
    fontSize: 28,
    lineHeight: 34,
  },
  rightStatsCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
  },
  adviceBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 4,
  },
});
