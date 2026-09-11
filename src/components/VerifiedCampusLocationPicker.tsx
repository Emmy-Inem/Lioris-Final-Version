import React, { useState, useMemo } from 'react';
import { View, Pressable, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { CAMPUS_LANDMARKS, CampusLandmark, searchLandmarks } from '@/api/campusMap';
import { haptics } from '@/utils/haptics';

interface VerifiedCampusLocationPickerProps {
  campusCode: string;
  value: string;
  onChangeLocation: (locationName: string, landmark?: CampusLandmark) => void;
  roomDetail?: string;
  onChangeRoomDetail?: (room: string) => void;
  placeholder?: string;
}

export function VerifiedCampusLocationPicker({
  campusCode,
  value,
  onChangeLocation,
  roomDetail = '',
  onChangeRoomDetail,
  placeholder = 'Search verified campus halls & auditoriums...',
}: VerifiedCampusLocationPickerProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isSearching, setIsSearching] = useState(false);

  // Normalize campus code
  const campus = (campusCode || 'UI').toUpperCase();

  // Find if current value matches a verified landmark
  const matchedLandmark = useMemo(() => {
    if (!value) return null;
    const valLower = value.toLowerCase().trim();
    return CAMPUS_LANDMARKS.find(
      (l) =>
        (l.campus.toUpperCase() === campus || campus === 'GLOBAL') &&
        (l.name.toLowerCase() === valLower ||
          l.name.toLowerCase().includes(valLower) ||
          valLower.includes(l.name.toLowerCase()) ||
          (l.shortCode && l.shortCode.toLowerCase() === valLower))
    );
  }, [value, campus]);

  // Available landmarks for selected campus
  const campusLandmarks = useMemo(() => {
    return CAMPUS_LANDMARKS.filter(
      (l) => campus === 'GLOBAL' || l.campus.toUpperCase() === campus
    );
  }, [campus]);

  // Categories present in this campus
  const categories = useMemo(() => {
    const set = new Set<string>();
    campusLandmarks.forEach((l) => set.add(l.category));
    return ['All', ...Array.from(set)];
  }, [campusLandmarks]);

  // Filtered landmarks list
  const filteredLandmarks = useMemo(() => {
    let pool = searchLandmarks(searchQuery, campus, campusLandmarks);
    if (activeCategory !== 'All') {
      pool = pool.filter((l) => l.category === activeCategory);
    }
    return pool;
  }, [searchQuery, campus, campusLandmarks, activeCategory]);

  function handleSelectLandmark(landmark: CampusLandmark) {
    haptics.light();
    onChangeLocation(landmark.name, landmark);
    setIsSearching(false);
    setSearchQuery('');
  }

  function handleCustomInput(text: string) {
    onChangeLocation(text);
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      {/* Field Label */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <AppText weight="bold" variant="bodySmall">
          Venue / Location:
        </AppText>
        {matchedLandmark ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="checkmark-circle" size={14} color="#10B981" />
            <AppText variant="caption" weight="bold" style={{ color: '#10B981' }}>
              Verified Campus Venue
            </AppText>
          </View>
        ) : (
          <Pressable onPress={() => setIsSearching(true)}>
            <AppText variant="caption" weight="bold" tone="brand">
              Browse Campus Directory
            </AppText>
          </Pressable>
        )}
      </View>

      {/* Selected Verified Venue Card */}
      {matchedLandmark && !isSearching ? (
        <View
          style={{
            backgroundColor: isDark ? '#111827' : '#ECFDF5',
            borderWidth: 1.5,
            borderColor: '#10B981',
            borderRadius: radius.md,
            padding: spacing.md,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Badge label="VERIFIED" tone="success" />
                <Badge label={matchedLandmark.category} tone="brand" />
                {matchedLandmark.shortCode && <Badge label={matchedLandmark.shortCode} tone="neutral" />}
              </View>
              <AppText weight="bold" style={{ fontSize: 15, marginTop: 4 }}>
                {matchedLandmark.name}
              </AppText>
              <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                {matchedLandmark.description}
              </AppText>
              {matchedLandmark.walkingTip && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="navigate-outline" size={12} color={colors.brandPrimary} />
                  <AppText variant="caption" tone="brand" style={{ fontSize: 11, flex: 1 }}>
                    {matchedLandmark.walkingTip}
                  </AppText>
                </View>
              )}
            </View>

            <Pressable
              onPress={() => setIsSearching(true)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              <AppText variant="caption" weight="bold" tone="secondary">
                Change
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Venue Search & Autocomplete Input */
        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: isSearching ? colors.brandPrimary : colors.border,
              borderRadius: radius.md,
              paddingHorizontal: spacing.sm,
              height: 44,
            }}
          >
            <Ionicons name="location-outline" size={18} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontSize: 14,
                paddingVertical: 8,
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              value={searchQuery || value}
              onChangeText={(text) => {
                setSearchQuery(text);
                handleCustomInput(text);
                if (!isSearching) setIsSearching(true);
              }}
              onFocus={() => setIsSearching(true)}
            />
            {(searchQuery || value) ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  onChangeLocation('');
                  setIsSearching(true);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {/* Directory Suggestions Drawer */}
          {isSearching && (
            <View
              style={{
                marginTop: spacing.xs,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                padding: spacing.sm,
                maxHeight: 260,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 6,
                elevation: 2,
              }}
            >
              {/* Category Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xs }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {categories.map((cat) => {
                    const selected = activeCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setActiveCategory(cat)}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: radius.pill,
                          backgroundColor: selected ? colors.brandPrimary : colors.pastelPrimaryBg,
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'brand'} style={{ fontSize: 10.5 }}>
                          {cat}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Verified Locations List */}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
                {filteredLandmarks.length > 0 ? (
                  filteredLandmarks.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handleSelectLandmark(item)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 6,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                            <AppText weight="bold" numberOfLines={1} style={{ fontSize: 13 }}>
                              {item.name}
                            </AppText>
                          </View>
                          <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ marginTop: 2, fontSize: 11 }}>
                            {item.description}
                          </AppText>
                        </View>
                        <Badge label={item.category} tone="neutral" />
                      </View>
                    </Pressable>
                  ))
                ) : (
                  <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                    <AppText tone="secondary" variant="caption">
                      No exact landmark match. Using "{searchQuery || value}" as a custom location.
                    </AppText>
                    <Pressable
                      onPress={() => setIsSearching(false)}
                      style={{ marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: colors.pastelPrimaryBg, borderRadius: radius.pill }}
                    >
                      <AppText variant="caption" weight="bold" tone="brand">
                        Confirm Custom Location
                      </AppText>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {/* Optional Specific Room or Floor Detail Input */}
      {onChangeRoomDetail && (
        <View style={{ marginTop: spacing.xs }}>
          <TextInput
            style={{
              height: 38,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.sm,
              fontSize: 13,
              color: colors.textPrimary,
            }}
            placeholder="Room / Floor details (optional, e.g. 2nd Floor, Room 304)"
            placeholderTextColor={colors.textSecondary}
            value={roomDetail}
            onChangeText={onChangeRoomDetail}
          />
        </View>
      )}
    </View>
  );
}
