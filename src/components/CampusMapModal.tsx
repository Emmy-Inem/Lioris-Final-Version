import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import {
  CAMPUS_LANDMARKS,
  CampusLandmark,
  searchLandmarks,
  getOsmEmbedUrl,
  getDirectionsUrl,
} from '@/api/campusMap';

interface CampusMapModalProps {
  visible: boolean;
  onClose: () => void;
  initialLandmarkName?: string;
  campusFilter?: string;
}

const CATEGORY_FILTERS = [
  'All',
  'Lecture Hall',
  'Library',
  'Administrative',
  'Hostel',
  'Food & Social',
  'Medical',
];

export function CampusMapModal({
  visible,
  onClose,
  initialLandmarkName,
  campusFilter = 'UI',
}: CampusMapModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();

  const [query, setQuery] = useState(initialLandmarkName || '');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedLandmark, setSelectedLandmark] = useState<CampusLandmark>(
    CAMPUS_LANDMARKS[0]
  );

  const isEnabled = isFeatureEnabled('campus_map');

  if (!isEnabled) return null;

  const allLandmarks = searchLandmarks(query, campusFilter);
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
              width: isDesktop ? 720 : '94%',
              maxHeight: isDesktop ? '90%' : '94%',
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
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                OpenStreetMap navigation for academic halls & landmarks
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
          </View>

          {/* Search Bar */}
          <View style={[styles.searchBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search hall, faculty, or hostel..."
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.textPrimary }]}
            />
          </View>

          {/* Categories */}
          <View style={{ marginBottom: 8 }}>
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
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {filtered.map((item) => {
              const isSelected = item.id === selectedLandmark.id;
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AppText variant="bodySmall" weight="bold" numberOfLines={1}>
                        {item.name}
                      </AppText>
                      {item.shortCode && <Badge label={item.shortCode} tone="neutral" />}
                    </View>
                    <AppText variant="caption" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
                      {item.description}
                    </AppText>
                    {item.walkingTip && (
                      <AppText variant="caption" style={{ color: colors.brandPrimary, marginTop: 2, fontSize: 11 }}>
                        📍 {item.walkingTip}
                      </AppText>
                    )}
                  </View>

                  <AppButton
                    label="Directions"
                    size="sm"
                    variant="ghost"
                    onPress={() => openDirections(item)}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapFrame: {
    height: 180,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  nativeMapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    height: '100%',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  landmarkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
});
