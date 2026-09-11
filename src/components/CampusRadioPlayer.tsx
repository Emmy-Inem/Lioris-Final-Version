import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { GlassCard } from '@/components/GlassCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import {
  campusRadio,
  VERIFIED_STATIONS,
  searchOnlineStations,
  RadioStation,
  RadioPlaybackState,
} from '@/api/campusRadio';

const CATEGORIES = ['All', 'Campus & Education', 'News & Talk', 'Music & Culture', 'Study & Lo-Fi'] as const;

export function CampusRadioPlayer() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();

  const [radioState, setRadioState] = useState<RadioPlaybackState>(campusRadio.getState());
  const [minimized, setMinimized] = useState(false);
  const [showStations, setShowStations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [stationList, setStationList] = useState<RadioStation[]>(VERIFIED_STATIONS);
  const [searching, setSearching] = useState(false);

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

  useEffect(() => {
    let mounted = true;
    if (!searchQuery.trim()) {
      setStationList(VERIFIED_STATIONS);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchOnlineStations(searchQuery);
        if (mounted) setStationList(results);
      } catch (err) {
        if (mounted) setStationList(VERIFIED_STATIONS);
      } finally {
        if (mounted) setSearching(false);
      }
    }, 400);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  if (!isEnabled) return null;

  const current = radioState.currentStation;

  const filteredStations = stationList.filter((s) => {
    if (activeCategory === 'All') return true;
    return s.category === activeCategory;
  });

  function handleStationSelect(station: RadioStation) {
    campusRadio.playStation(station);
    setShowStations(false);
  }

  function nextStation() {
    const list = filteredStations.length > 0 ? filteredStations : VERIFIED_STATIONS;
    const idx = list.findIndex((s) => s.id === current.id);
    const next = list[(idx + 1) % list.length];
    campusRadio.playStation(next);
  }

  if (minimized) {
    return (
      <Pressable
        onPress={() => setMinimized(false)}
        style={[
          styles.minimizedPill,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.70)' : 'rgba(255, 255, 255, 0.75)',
            borderColor: radioState.isPlaying ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: isDark
                ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 14px rgba(0,0,0,0.35)'
                : 'inset 0 1px 1px #fff, 0 4px 14px rgba(0,0,0,0.08)',
            } as any),
        ]}
      >
        <Ionicons
          name={radioState.isPlaying ? 'radio' : 'radio-outline'}
          size={16}
          color={radioState.isPlaying ? colors.brandPrimary : colors.textSecondary}
        />
        <AppText variant="caption" weight="bold" style={{ marginLeft: 6 }}>
          {current.name} ({current.frequency})
        </AppText>
        {radioState.isPlaying && (
          <View style={[styles.pulseDot, { backgroundColor: colors.brandPrimary }]} />
        )}
      </Pressable>
    );
  }

  return (
    <GlassCard
      radius={20}
      padded={false}
      style={{
        marginBottom: spacing.md,
      }}
      contentStyle={styles.playerCard}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.stationBadgeGroup}>
          <Ionicons
            name="radio"
            size={18}
            color={radioState.isPlaying ? colors.brandPrimary : colors.textSecondary}
          />
          <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
            {current.name}
          </AppText>
          <Badge
            label={radioState.isPlaying ? 'ON AIR' : radioState.isLoading ? 'BUFFERING' : 'LIVE'}
            tone={radioState.isPlaying ? 'success' : radioState.isLoading ? 'warning' : 'neutral'}
          />
          <AppText variant="caption" tone="secondary" style={{ fontSize: 11 }}>
            {current.frequency}
          </AppText>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowStations(!showStations)}
            hitSlop={8}
            style={[styles.smallBtn, { backgroundColor: colors.brandPrimary + '15' }]}
          >
            <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 11 }}>
              {showStations ? 'Close ▴' : 'Browse Stations ▾'}
            </AppText>
          </Pressable>
          <Pressable onPress={() => setMinimized(true)} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Station Subtitle & Description */}
      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginVertical: 3 }}>
        {current.campusOrCity} • {current.description}
      </AppText>

      {/* Error / Buffering Indicator */}
      {radioState.errorMessage ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={colors.warning} />
          <AppText variant="caption" style={{ color: colors.warning, fontSize: 11, marginLeft: 4 }}>
            {radioState.errorMessage} — retrying...
          </AppText>
        </View>
      ) : null}

      {/* STATIONS BROWSER & ONLINE SEARCH PANEL */}
      {showStations && (
        <View style={[styles.browserContainer, { borderColor: colors.divider, backgroundColor: colors.background }]}>
          {/* Search Bar */}
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={15} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search 40,000+ stations (e.g. Lagos, Ibadan, Wazobia, Lofi)..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {searching && <ActivityIndicator size="small" color={colors.brandPrimary} />}
            {searchQuery ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {/* Category Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 6 }}>
            {CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: isSelected ? colors.brandPrimary : colors.surface,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight={isSelected ? 'bold' : 'regular'}
                    style={{ color: isSelected ? '#FFFFFF' : colors.textSecondary, fontSize: 11 }}
                  >
                    {cat}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Station List */}
          <ScrollView style={{ maxHeight: 210 }} showsVerticalScrollIndicator={false}>
            {filteredStations.map((st) => {
              const isCurrent = st.id === current.id;
              return (
                <Pressable
                  key={st.id}
                  onPress={() => handleStationSelect(st)}
                  style={[
                    styles.stationRow,
                    isCurrent && { backgroundColor: colors.brandPrimary + '15', borderRadius: 10 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="caption" weight="bold" numberOfLines={1}>
                        {st.name} ({st.frequency})
                      </AppText>
                      {st.codec ? (
                        <Badge label={st.codec} tone="neutral" />
                      ) : null}
                    </View>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10 }}>
                      {st.campusOrCity} • {st.category}
                    </AppText>
                  </View>

                  {isCurrent ? (
                    <Ionicons name="volume-high" size={16} color={colors.brandPrimary} />
                  ) : (
                    <Ionicons name="play-circle-outline" size={18} color={colors.textSecondary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Audio Playback Controls Row */}
      <View style={styles.controlsRow}>
        <View style={styles.leftControls}>
          <Pressable
            onPress={() => campusRadio.togglePlay()}
            style={[styles.playBtn, { backgroundColor: colors.brandPrimary }]}
          >
            {radioState.isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name={radioState.isPlaying ? 'pause' : 'play'}
                size={20}
                color="#FFFFFF"
              />
            )}
          </Pressable>
          <Pressable onPress={nextStation} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="play-forward" size={18} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.nowPlayingIndicator}>
            <AppText variant="caption" weight="semiBold" numberOfLines={1}>
              {radioState.isPlaying ? 'Streaming Live Audio' : 'Paused'}
            </AppText>
            {current.bitrate ? (
              <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                {current.bitrate} kbps • High-Fidelity
              </AppText>
            ) : null}
          </View>
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
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    padding: 14,
    borderWidth: 1,
  },
  minimizedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 8,
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
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  iconBtn: {
    padding: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  browserContainer: {
    borderWidth: 1,
    borderRadius: 14,
    marginVertical: 8,
    padding: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    marginLeft: 6,
    height: '100%',
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
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
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  nowPlayingIndicator: {
    flex: 1,
    minWidth: 0,
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
