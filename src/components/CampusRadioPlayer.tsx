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
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            borderColor: radioState.isPlaying ? colors.brandPrimary : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: isDark
                ? 'inset 0 1px 0 rgba(255,255,255,0.05)'
                : 'inset 0 1px 1px #fff',
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

function EqualizerVisualizer({ isPlaying, color }: { isPlaying: boolean; color: string }) {
  const [heights, setHeights] = useState([6, 12, 8, 16, 10]);

  useEffect(() => {
    if (!isPlaying) {
      setHeights([4, 6, 4, 8, 5]);
      return;
    }
    const interval = setInterval(() => {
      setHeights([
        Math.floor(Math.random() * 12) + 6,
        Math.floor(Math.random() * 16) + 8,
        Math.floor(Math.random() * 10) + 6,
        Math.floor(Math.random() * 18) + 8,
        Math.floor(Math.random() * 14) + 6,
      ]);
    }, 160);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5, height: 22, paddingBottom: 2 }}>
      {heights.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 1.5,
            backgroundColor: color,
            opacity: isPlaying ? 0.95 : 0.35,
          }}
        />
      ))}
    </View>
  );
}

  return (
    <GlassCard
      radius={20}
      padded={false}
      style={{
        marginBottom: spacing.md,
      }}
      contentStyle={[
        styles.playerCard,
        {
          borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)',
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.85)',
        },
      ]}
    >
      {/* Top Header Row */}
      <View style={styles.topRow}>
        <View style={styles.stationBadgeGroup}>
          <View style={[styles.radioIconWrap, { backgroundColor: radioState.isPlaying ? 'rgba(34, 197, 94, 0.15)' : colors.brandPrimary + '15', flexShrink: 0 }]}>
            <Ionicons
              name="radio"
              size={15}
              color={radioState.isPlaying ? '#22c55e' : colors.brandPrimary}
            />
          </View>
          <AppText variant="bodySmall" weight="bold" numberOfLines={1} style={{ fontSize: 13, flex: 1, minWidth: 0 }}>
            {current.name}
          </AppText>
          {isDesktop && (
            <>
              <View style={[styles.liveBadge, { backgroundColor: radioState.isPlaying ? 'rgba(34, 197, 94, 0.15)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: radioState.isPlaying ? 'rgba(34, 197, 94, 0.35)' : isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)', flexShrink: 0 }]}>
                <View style={[styles.liveDot, { backgroundColor: radioState.isPlaying ? '#22c55e' : colors.textSecondary }]} />
                <AppText variant="caption" weight="bold" style={{ color: radioState.isPlaying ? colors.success : colors.textSecondary, fontSize: 10, letterSpacing: 0.5 }}>
                  {radioState.isPlaying ? 'ON AIR' : radioState.isLoading ? 'CONNECTING' : 'PAUSED'}
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" style={{ fontSize: 11, fontWeight: '600', flexShrink: 0 }}>
                {current.frequency}
              </AppText>
            </>
          )}
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowStations(!showStations)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Browse radio stations"
            style={[
              styles.smallBtn,
              {
                backgroundColor: showStations ? colors.brandPrimary : colors.brandPrimary + '15',
                borderColor: colors.brandPrimary + '30',
                borderWidth: 1,
                flexShrink: 0,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="bold"
              style={{
                color: showStations ? '#FFFFFF' : colors.brandPrimary,
                fontSize: 11,
              }}
            >
              {showStations ? 'Close ▴' : isDesktop ? 'Browse Stations ▾' : 'Browse ▾'}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimise radio player"
            onPress={() => setMinimized(true)}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)', borderRadius: 8, flexShrink: 0 }]}
          >
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Sub-header on mobile: Status Badge + Frequency + Description */}
      {!isDesktop ? (
        <View style={styles.mobileMetaRow}>
          <View style={[styles.liveBadge, { backgroundColor: radioState.isPlaying ? 'rgba(34, 197, 94, 0.15)' : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: radioState.isPlaying ? 'rgba(34, 197, 94, 0.35)' : isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)', flexShrink: 0 }]}>
            <View style={[styles.liveDot, { backgroundColor: radioState.isPlaying ? '#22c55e' : colors.textSecondary }]} />
            <AppText variant="caption" weight="bold" style={{ color: radioState.isPlaying ? colors.success : colors.textSecondary, fontSize: 9.5, letterSpacing: 0.5 }}>
              {radioState.isPlaying ? 'ON AIR' : radioState.isLoading ? 'CONNECTING' : 'PAUSED'}
            </AppText>
          </View>
          <View style={[styles.freqPill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)', borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.06)' }]}>
            <AppText variant="caption" tone="secondary" style={{ fontSize: 10, fontWeight: '700' }}>
              {current.frequency}
            </AppText>
          </View>
          <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 11 }}>
            {current.campusOrCity} • {current.description}
          </AppText>
        </View>
      ) : (
        /* Station Subtitle & Description on Desktop */
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 4, marginBottom: 8, fontSize: 11.5 }}>
          {current.campusOrCity} • {current.description}
        </AppText>
      )}

      {/* Error / Buffering Indicator */}
      {radioState.errorMessage ? (
        <View style={[styles.errorRow, { backgroundColor: 'rgba(239, 68, 68, 0.10)', borderColor: 'rgba(239, 68, 68, 0.20)', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 8 }]}>
          <Ionicons name="alert-circle" size={14} color={colors.critical} />
          <AppText variant="caption" style={{ color: colors.critical, fontSize: 11, marginLeft: 4 }}>
            {radioState.errorMessage} — retrying...
          </AppText>
        </View>
      ) : null}

      {/* STATIONS BROWSER & ONLINE SEARCH PANEL */}
      {showStations && (
        <View style={[styles.browserContainer, { borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)', backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(248, 250, 252, 0.95)' }]}>
          {/* Search Bar */}
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Ionicons name="search" size={15} color={colors.textSecondary} />
            <TextInput
              accessibilityLabel="Search 40,000+ stations (e.g. Lagos, Ibadan, Wazobia, Lofi)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search 40,000+ stations (e.g. Lagos, Ibadan, Wazobia, Lofi)..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
            {searching && <ActivityIndicator size="small" color={colors.brandPrimary} />}
            {searchQuery ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => setSearchQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {/* Category Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 8 }}>
            {CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: isSelected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
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
          <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
            {filteredStations.map((st) => {
              const isCurrent = st.id === current.id;
              return (
                <Pressable
                  key={st.id}
                  onPress={() => handleStationSelect(st)}
                  style={[
                    styles.stationRow,
                    isCurrent && { backgroundColor: colors.brandPrimary + '18', borderRadius: 10 },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="caption" weight="bold" numberOfLines={1} style={{ fontSize: 12 }}>
                        {st.name} ({st.frequency})
                      </AppText>
                      {st.codec ? (
                        <Badge label={st.codec} tone="neutral" />
                      ) : null}
                    </View>
                    <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5, marginTop: 1 }}>
                      {st.campusOrCity} • {st.category}
                    </AppText>
                  </View>

                  {isCurrent ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <EqualizerVisualizer isPlaying={radioState.isPlaying} color={colors.brandPrimary} />
                      <Ionicons name="volume-high" size={16} color={colors.brandPrimary} />
                    </View>
                  ) : (
                    <Ionicons name="play-circle-outline" size={20} color={colors.textSecondary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Audio Playback Controls Row */}
      <View style={[styles.controlsRow, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)' }]}>
        <View style={styles.leftControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={radioState.isPlaying ? 'Pause radio' : 'Play radio'}
            onPress={() => campusRadio.togglePlay()}
            style={({ hovered }: any) => [
              styles.playBtn,
              {
                backgroundColor: colors.brandPrimary,
                opacity: hovered ? 0.92 : 1,
              },
              Platform.OS === 'web' && ({
                boxShadow: radioState.isPlaying
                  ? '0 4px 14px rgba(59, 130, 246, 0.45)'
                  : '0 2px 8px rgba(0, 0, 0, 0.15)',
              } as any),
            ]}
          >
            {radioState.isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name={radioState.isPlaying ? 'pause' : 'play'}
                size={20}
                color="#FFFFFF"
                style={{ marginLeft: radioState.isPlaying ? 0 : 2 }}
              />
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next station"
            onPress={nextStation}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)', borderRadius: 10 }]}
          >
            <Ionicons name="play-forward" size={18} color={colors.textPrimary} />
          </Pressable>

          <View style={styles.nowPlayingIndicator}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText variant="caption" weight="semiBold" numberOfLines={1} style={{ fontSize: 12 }}>
                {radioState.isPlaying ? 'Streaming Live Audio' : 'Audio Paused'}
              </AppText>
              <EqualizerVisualizer isPlaying={radioState.isPlaying} color={colors.brandPrimary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ fontSize: 10.5, flexShrink: 1 }}>
                {current.bitrate || 128} kbps • High-Fidelity
              </AppText>
              <View style={[styles.hqPill, { backgroundColor: colors.brandPrimary + '15', borderColor: colors.brandPrimary + '30', flexShrink: 0 }]}>
                <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 9 }}>
                  HQ STEREO
                </AppText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.rightControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={radioState.isMuted ? 'Unmute radio' : 'Mute radio'}
            onPress={() => campusRadio.toggleMute()}
            hitSlop={8}
            style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)', borderRadius: 10 }]}
          >
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
    padding: 16,
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
  radioIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 10,
  },
  iconBtn: {
    padding: 6,
  },
  mobileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  freqPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  browserContainer: {
    borderWidth: 1,
    borderRadius: 14,
    marginVertical: 10,
    padding: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    marginLeft: 6,
    height: '100%',
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
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
    marginLeft: 2,
  },
  hqPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
  },
  playBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
