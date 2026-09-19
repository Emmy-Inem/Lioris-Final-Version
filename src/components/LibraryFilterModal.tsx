import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { ALL_DEPARTMENTS } from '@/data/departments';

export interface LibraryFilters {
  resourceType: string;
  department: string;
  studyLevel: string;
  minRating: string;
  sortBy: string;
}

const RESOURCE_TYPES = ['All Types', 'Notes', 'Past Questions', 'Projects'];
const DEPARTMENTS = ['All Depts', ...ALL_DEPARTMENTS];
const STUDY_LEVELS = ['All Levels', '100 Lvl', '200 Lvl', '300 Lvl', '400 Lvl'];
const RATINGS = ['All Ratings', '3.0+ Stars', '4.0+ Stars', '4.5+ Stars'];
const SORT_OPTIONS = ['Newest Shared', 'Highest Quality Rated'];

export const DEFAULT_LIBRARY_FILTERS: LibraryFilters = {
  resourceType: 'All Types',
  department: 'All Depts',
  studyLevel: 'All Levels',
  minRating: 'All Ratings',
  sortBy: 'Newest Shared',
};

interface LibraryFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: LibraryFilters;
  onApply: (filters: LibraryFilters) => void;
}

/** Ported from "Library Filter Options" modal, wired to the Library screen's filter icon. */
export function LibraryFilterModal({ visible, onClose, filters, onApply }: LibraryFilterModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<LibraryFilters>(filters);

  function handleReset() {
    setDraft(DEFAULT_LIBRARY_FILTERS);
  }

  function handleApply() {
    onApply(draft);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View accessibilityViewIsModal
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: isDesktop ? 'center' : 'flex-end',
          alignItems: isDesktop ? 'center' : 'stretch',
          padding: isDesktop ? spacing.lg : 0,
        }}
      >
        <Pressable style={{ position: 'absolute', inset: 0 }} onPress={onClose} accessible={false} />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderRadius: isDesktop ? 24 : undefined,
            padding: spacing.lg,
            paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, spacing.md),
            maxHeight: '85%',
            maxWidth: 540,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          {/* Mobile grab handle */}
          {!isDesktop && (
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.divider,
                alignSelf: 'center',
                marginBottom: spacing.md,
              }}
            />
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <AppText variant="h2" weight="bold">
              Library Filter Options 📚
            </AppText>
            <AppText weight="bold" tone="brand" onPress={handleReset}>
              Reset All
            </AppText>
          </View>

          <ScrollView style={{ flex: 1, width: '100%' }} showsVerticalScrollIndicator={false}>
            <FilterSection
              label="Resource Type"
              options={RESOURCE_TYPES}
              selected={draft.resourceType}
              onSelect={(v) => setDraft((prev) => ({ ...prev, resourceType: v }))}
            />
            <FilterSection
              label="Department"
              options={DEPARTMENTS}
              selected={draft.department}
              onSelect={(v) => setDraft((prev) => ({ ...prev, department: v }))}
            />
            <FilterSection
              label="Study Level"
              options={STUDY_LEVELS}
              selected={draft.studyLevel}
              onSelect={(v) => setDraft((prev) => ({ ...prev, studyLevel: v }))}
            />
            <FilterSection
              label="Minimum Rating Quality"
              options={RATINGS}
              selected={draft.minRating}
              onSelect={(v) => setDraft((prev) => ({ ...prev, minRating: v }))}
            />
            <FilterSection
              label="Sort Documents By"
              options={SORT_OPTIONS}
              selected={draft.sortBy}
              onSelect={(v) => setDraft((prev) => ({ ...prev, sortBy: v }))}
              last
            />
          </ScrollView>

          <View style={{ marginTop: spacing.lg }}>
            <AppButton label="Apply Filters" onPress={handleApply} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterSection({
 label,
 options,
 selected,
 onSelect,
 last,
}: {
 label: string;
 options: string[];
 selected: string;
 onSelect: (v: string) => void;
 last?: boolean;
}) {
 const { colors, spacing, radius } = useTheme();
 return (
 <View style={{ marginBottom: last ? 0 : spacing.lg }}>
 <AppText weight="semiBold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
 {label}
 </AppText>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
 {options.map((opt) => {
 const isSelected = opt === selected;
 return (
 <Pressable
 key={opt}
 onPress={() => onSelect(opt)}
 accessibilityRole="radio"accessibilityState={{ checked: isSelected }}
 accessibilityLabel={opt}
 style={{
 paddingHorizontal: spacing.md,
 paddingVertical: spacing.sm,
 borderRadius: radius.pill,
 backgroundColor: isSelected ? colors.pastelPrimaryBg : 'transparent',
 borderWidth: isSelected ? 0 : 1,
 borderColor: colors.border,
 }}
 >
 <AppText variant="bodySmall"weight="semiBold"tone={isSelected ? 'brand' : 'secondary'}>
 {opt}
 </AppText>
 </Pressable>
 );
 })}
 </View>
 </View>
 );
}
