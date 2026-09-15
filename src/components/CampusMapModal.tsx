import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import {
  CAMPUS_LANDMARKS,
  CAMPUS_CENTERS,
  CampusLandmark,
  searchLandmarks,
  getOsmEmbedUrl,
  getDirectionsUrl,
  fetchOverpassCampusAmenities,
  formatDistanceAndEta,
} from '@/api/campusMap';

interface CampusMapModalProps {
  visible: boolean;
  onClose: () => void;
  initialLandmarkName?: string;
  campusFilter?: string;
}

const CATEGORY_FILTERS = [
  'All',
  'ATM & Bank',
  'Food & Social',
  'Medical',
  'Library',
  'Lecture Hall',
  'Administrative',
  'Hostel',
];

const AVAILABLE_CAMPUSES = ['UI', 'UNILAG', 'OAU', 'UNN', 'CU', 'FUNAAB', 'FUTA', 'ABU'];

export function CampusMapModal({
  visible,
  onClose,
  initialLandmarkName,
  campusFilter = 'UI',
}: CampusMapModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'staff' || user?.actualRole === 'admin';

  const [activeCampus, setActiveCampus] = useState((campusFilter || 'UI').toUpperCase());
  const [query, setQuery] = useState(initialLandmarkName || '');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [landmarks, setLandmarks] = useState<CampusLandmark[]>(CAMPUS_LANDMARKS);
  const [selectedLandmark, setSelectedLandmark] = useState<CampusLandmark>(CAMPUS_LANDMARKS[0]);
  const [loadingOsm, setLoadingOsm] = useState(false);

  const isEnabled = isFeatureEnabled('campus_map');

  useEffect(() => {
    if (campusFilter) {
      setActiveCampus(campusFilter.toUpperCase());
    }
  }, [campusFilter]);

  useEffect(() => {
    if (visible && isEnabled) {
      loadAmenities(activeCampus);
    }
  }, [visible, activeCampus, isEnabled]);

  async function loadAmenities(campusCode: string) {
    setLoadingOsm(true);
    try {
      const results = await fetchOverpassCampusAmenities(campusCode);
      setLandmarks(results);
      if (results.length > 0) {
        setSelectedLandmark(results[0]);
      }
    } catch {
      // fallback handled inside fetchOverpassCampusAmenities
    } finally {
      setLoadingOsm(false);
    }
  }

  if (!isEnabled) return null;

  const allLandmarks = searchLandmarks(query, activeCampus, landmarks);
  const filtered =
    selectedCategory === 'All'
      ? allLandmarks
      : allLandmarks.filter((l) => l.category === selectedCategory);

  function openDirections(landmark: CampusLandmark) {
    const url = getDirectionsUrl(landmark.latitude, landmark.longitude, landmark.name);
    Linking.openURL(url).catch(() => {});
  }

  const isWeb = Platform.OS === 'web';
  const embedUrl = getOsmEmbedUrl(selectedLandmark.latitude, selectedLandmark.longitude);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 760 : '95%',
              maxHeight: isDesktop ? '92%' : '95%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="map" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  Campus Map & Hall Locator
                </AppText>
                <Badge label="OpenStreetMap Live" tone="neutral" />
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                Interactive amenities, ATMs, clinics, food spots & faculty navigation
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: `${colors.textSecondary}15` }]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Campus Selector Bar - Strictly restricted to Administrators */}
          {isAdmin ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {AVAILABLE_CAMPUSES.map((cCode) => {
                  const isCurrent = activeCampus === cCode;
                  const cInfo = CAMPUS_CENTERS[cCode];
                  return (
                    <Pressable
                      key={cCode}
                      onPress={() => {
                        setActiveCampus(cCode);
                        loadAmenities(cCode);
                      }}
                      style={[
                        styles.campusPill,
                        {
                          backgroundColor: isCurrent ? colors.brandPrimary : colors.background,
                          borderColor: isCurrent ? colors.brandPrimary : colors.border,
                        },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        weight={isCurrent ? 'bold' : 'regular'}
                        style={{ color: isCurrent ? '#ffffff' : colors.textPrimary }}
                      >
                        {cInfo?.name ? `${cCode} - ${cInfo.name.split(' ')[0]}` : cCode}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="school" size={15} color={colors.brandPrimary} />
              <AppText variant="caption" weight="bold" tone="brand">
                {CAMPUS_CENTERS[activeCampus]?.name ?? `${activeCampus} Campus`} â€¢ Campus Amenities & Landmarks
              </AppText>
            </View>
          )}

          {/* Interactive Map View */}
          <View style={[styles.mapFrame, { borderColor: colors.border, backgroundColor: colors.background }]}>
            {isWeb ? (
              <iframe
                src={embedUrl}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                title="Campus OpenStreetMap"
              />
            ) : (
              <View style={styles.nativeMapPlaceholder}>
                <Ionicons name="navigate-circle" size={44} color={colors.brandPrimary} />
                <AppText variant="bodySmall" weight="bold" style={{ marginTop: 6 }}>
                  {selectedLandmark.name}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Lat {selectedLandmark.latitude}, Lon {selectedLandmark.longitude}
                </AppText>
              </View>
            )}

            {/* Selected Landmark Quick Overlay Banner */}
            <View style={[styles.selectedBanner, { backgroundColor: `${colors.surface}f0`, borderColor: colors.border }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                  {selectedLandmark.name}
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  {selectedLandmark.walkingTip || selectedLandmark.description}
                </AppText>
              </View>
              <Pressable
                onPress={() => openDirections(selectedLandmark)}
                style={[styles.directionBtn, { backgroundColor: colors.brandPrimary }]}
              >
                <Ionicons name="navigate" size={14} color="#ffffff" />
                <AppText variant="caption" weight="bold" style={{ color: '#ffffff' }}>
                  Directions
                </AppText>
              </Pressable>
            </View>
          </View>

          {/* Search Bar & Overpass Live Refresh */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 10, alignItems: 'center' }}>
            <View style={[styles.searchBar, { flex: 1, borderColor: colors.border, backgroundColor: colors.background }]}>
              <Ionicons name="search" size={16} color={colors.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search ATM, clinic, cafeteria, faculty..."
                placeholderTextColor={colors.textSecondary}
                style={[styles.searchInput, { color: colors.textPrimary }]}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>

            <Pressable
              onPress={() => {
                toast.info('Querying OpenStreetMap Overpass servers...');
                loadAmenities(activeCampus);
              }}
              disabled={loadingOsm}
              style={[
                styles.refreshBtn,
                {
                  backgroundColor: `${colors.brandPrimary}15`,
                  borderColor: `${colors.brandPrimary}40`,
                },
              ]}
            >
              {loadingOsm ? (
                <ActivityIndicator size="small" color={colors.brandPrimary} />
              ) : (
                <Ionicons name="refresh" size={16} color={colors.brandPrimary} />
              )}
            </Pressable>
          </View>

          {/* Categories */}
          <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {CATEGORY_FILTERS.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: isSelected ? colors.brandPrimary : `${colors.border}40`,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      weight={isSelected ? 'bold' : 'regular'}
                      style={{ color: isSelected ? '#ffffff' : colors.textSecondary }}
                    >
                      {cat}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Landmarks List */}
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="location-outline" size={32} color={colors.textSecondary} />
                <AppText tone="secondary" variant="bodySmall" style={{ marginTop: 8 }}>
                  No amenities found matching "{query}" in {selectedCategory}.
                </AppText>
              </View>
            ) : (
              filtered.map((item) => {
                const isSelected = item.id === selectedLandmark.id;
                const distanceInfo = item.distanceMeters ? formatDistanceAndEta(item.distanceMeters) : null;

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedLandmark(item)}
                    style={[
                      styles.landmarkItem,
                      {
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                        backgroundColor: isSelected ? `${colors.brandPrimary}08` : colors.surface,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                          {item.name}
                        </AppText>
                        {item.shortCode && <Badge label={item.shortCode} tone="neutral" />}
                        {item.isOsmLive && <Badge label="OSM Live" tone="success" />}
                      </View>

                      <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 2 }}>
                        {item.category} â€¢ {item.description}
                      </AppText>

                      {distanceInfo && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Ionicons name="walk-outline" size={12} color={colors.brandPrimary} />
                          <AppText variant="caption" tone="primary" weight="medium">
                            {distanceInfo.distanceText} ({distanceInfo.etaText})
                          </AppText>
                        </View>
                      )}
                    </View>

                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        openDirections(item);
                      }}
                      hitSlop={8}
                      style={[styles.actionIconBtn, { backgroundColor: `${colors.brandPrimary}15` }]}
                    >
                      <Ionicons name="navigate" size={16} color={colors.brandPrimary} />
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  modalContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  mapFrame: {
    height: 200,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  nativeMapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  selectedBanner: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  directionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  landmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
