import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import {
  campusRadio,
  CAMPUS_STATIONS,
  RadioStation,
  RadioPlaybackState,
} from '@/api/campusRadio';

export function CampusRadioPlayer() {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();

  const [radioState, setRadioState] = useState<RadioPlaybackState>(campusRadio.getState());
  const [minimized, setMinimized] = useState(false);
  const [showStations, setShowStations] = useState(false);

  const isEnabled = isFeatureEnabled('campus_radio');

  useEffect(() => {
    if (!isEnabled) {
      campusRadio.pause();
      return;
    }
    const unsubscribe = campusRadio.subscribe((next) => {
      setRadioState(next);
    });
    return unsubscribe;
  }, [isEnabled]);

  if (!isEnabled) return null;

  const current = radioState.currentStation;

  function handleStationSelect(station: RadioStation) {
    campusRadio.playStation(station);
    setShowStations(false);
  }

  function nextStation() {
    const idx = CAMPUS_STATIONS.findIndex((s) => s.id === current.id);
    const next = CAMPUS_STATIONS[(idx + 1) % CAMPUS_STATIONS.length];
    campusRadio.playStation(next);
  }

  if (minimized) {
    return (
      <Pressable
        onPress={() => setMinimized(false)}
        style={[
          styles.minimizedPill,
          {
            backgroundColor: colors.surface,
            borderColor: radioState.isPlaying ? colors.brandPrimary : colors.border,
          },
        ]}
      >
        <Ionicons
          name={radioState.isPlaying ? 'radio' : 'radio-outline'}
          size={16}
          color={radioState.isPlaying ? colors.brandPrimary : colors.textSecondary}
        />
        <AppText variant="caption" weight="bold" style={{ marginLeft: 4 }}>
          {current.frequency}
        </AppText>
        {radioState.isPlaying && (
          <View style={[styles.pulseDot, { backgroundColor: colors.brandPrimary }]} />
        )}
      </Pressable>
    );
  }

  return (
    <SolidCard
      radius={18}
      style={[
        styles.playerCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          marginBottom: spacing.md,
        },
      ]}
    >
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.stationBadgeGroup}>
          <Ionicons name="radio" size={16} color={colors.brandPrimary} />
          <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
            {current.name} ({current.frequency})
          </AppText>
          <Badge
            label={radioState.isPlaying ? 'ON AIR' : 'LIVE'}
            tone={radioState.isPlaying ? 'success' : 'neutral'}
          />
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowStations(!showStations)}
            hitSlop={8}
            style={[styles.smallBtn, { backgroundColor: `${colors.brandPrimary}15` }]}
          >
            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary }}>
              Stations ▾
            </AppText>
          </Pressable>
          <Pressable onPress={() => setMinimized(true)} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Description & Campus */}
      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginVertical: 4 }}>
        {current.campus} • {current.genre}
      </AppText>

      {/* Stations Picker Dropdown */}
      {showStations && (
        <View style={[styles.stationsDropdown, { borderColor: colors.divider, backgroundColor: colors.background }]}>
          {CAMPUS_STATIONS.map((st) => (
            <Pressable
              key={st.id}
              onPress={() => handleStationSelect(st)}
              style={[
                styles.stationItem,
                st.id === current.id && { backgroundColor: `${colors.brandPrimary}15` },
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="caption" weight={st.id === current.id ? 'bold' : 'regular'}>
                  {st.name} ({st.frequency})
                </AppText>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                  {st.campus}
                </AppText>
              </View>
              {st.id === current.id && (
                <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} />
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Playback Controls */}
      <View style={styles.controlsRow}>
        <View style={styles.leftControls}>
          <Pressable
            onPress={() => campusRadio.togglePlay()}
            style={[styles.playBtn, { backgroundColor: colors.brandPrimary }]}
          >
            <Ionicons
              name={radioState.isPlaying ? 'pause' : 'play'}
              size={20}
              color="#ffffff"
            />
          </Pressable>
          <Pressable onPress={nextStation} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="play-forward" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.rightControls}>
          <Pressable onPress={() => campusRadio.toggleMute()} hitSlop={8} style={styles.iconBtn}>
            <Ionicons
              name={radioState.isMuted ? 'volume-mute' : 'volume-high'}
              size={18}
              color={radioState.isMuted ? colors.critical : colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </SolidCard>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    padding: 12,
    borderWidth: 1,
  },
  minimizedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stationBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  iconBtn: {
    padding: 4,
  },
  stationsDropdown: {
    borderWidth: 1,
    borderRadius: 10,
    marginVertical: 8,
    padding: 4,
  },
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
  },
  leftControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
