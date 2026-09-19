import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { getAcademicStructure } from '@/data/departments';
import { haptics } from '@/utils/haptics';

interface DepartmentPickerProps {
  value: string | null;
  onChange: (department: string, facultyOrCollege?: string) => void;
  campusCode?: string;
  label?: string;
  placeholder?: string;
}

/**
 * Searchable, campus-aware academic department picker.
 *
 * Automatically adapts between "College" (e.g. FUNAAB: COLPHYS, COLENG, COLBIOS)
 * and "Faculty" (e.g. UI, UNILAG: Science, Engineering, Arts, Law).
 * Provides horizontal filter chips for instant filtering by College/Faculty,
 * as well as instant debounced text search across all departments.
 */
export function DepartmentPicker({
  value,
  onChange,
  campusCode,
  label = 'Department',
  placeholder = 'Search or select your department',
}: DepartmentPickerProps) {
  const { colors, spacing, radius, minTouchTarget } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeGroupCode, setActiveGroupCode] = useState<string | null>(null);

  const structure = useMemo(() => getAcademicStructure(campusCode), [campusCode]);
  const groupLabel = structure.groupType; // 'College' | 'Faculty'

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return structure.groups
      .filter((group) => {
        if (!activeGroupCode) return true;
        return (group.code || group.faculty) === activeGroupCode;
      })
      .map((group) => ({
        ...group,
        departments: group.departments.filter((d) => {
          if (!q) return true;
          return d.toLowerCase().includes(q) || group.faculty.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.departments.length > 0);
  }, [structure, query, activeGroupCode]);

  function handleSelect(department: string, facultyOrCollege: string) {
    haptics.light();
    onChange(department, facultyOrCollege);
    setQuery('');
    setActiveGroupCode(null);
    setOpen(false);
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? (
        <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginBottom: spacing.xs }}>
          {label}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${label}: ${value}` : label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: minTouchTarget,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.md,
        }}
      >
        <AppText style={{ flex: 1 }} tone={value ? 'primary' : 'secondary'}>
          {value || placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          accessibilityViewIsModal
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: isDesktop ? 'center' : 'flex-end',
            alignItems: isDesktop ? 'center' : 'stretch',
            padding: isDesktop ? spacing.lg : 0,
          }}
        >
          <Pressable style={{ position: 'absolute', inset: 0 }} onPress={() => setOpen(false)} />
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderRadius: isDesktop ? 24 : undefined,
              maxHeight: isDesktop ? '85%' : '85%',
              maxWidth: 580,
              width: '100%',
              alignSelf: 'center',
              paddingTop: spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, spacing.md),
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

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <View>
                <AppText variant="h2" weight="bold">
                  Select Department
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Showing {groupLabel.toLowerCase()}s for {structure.campusCode}
                </AppText>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            <AppTextField
              placeholder={`Search departments or ${groupLabel.toLowerCase()}s...`}
              value={query}
              onChangeText={setQuery}
              leftIcon="search"
              autoFocus
            />

            {/* Horizontal Filter Chips for Colleges / Faculties */}
            <View style={{ marginBottom: spacing.sm, marginTop: -spacing.xs }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setActiveGroupCode(null);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: radius.pill,
                    backgroundColor: activeGroupCode === null ? colors.brandPrimary : colors.divider,
                  }}
                >
                  <AppText
                    variant="caption"
                    weight="bold"
                    tone={activeGroupCode === null ? 'inverse' : 'secondary'}
                  >
                    All {groupLabel}s
                  </AppText>
                </Pressable>

                {structure.groups.map((group) => {
                  const key = group.code || group.faculty;
                  const isSelected = activeGroupCode === key;
                  const displayChip = group.code || group.faculty.replace(/^Faculty of (the )?|^College of /, '');
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        haptics.light();
                        setActiveGroupCode(isSelected ? null : key);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: isSelected ? colors.brandPrimary : colors.divider,
                      }}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        tone={isSelected ? 'inverse' : 'secondary'}
                      >
                        {displayChip}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Department List */}
            <ScrollView
              style={{ flex: 1, marginBottom: spacing.sm }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredGroups.length === 0 ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                  <Ionicons name="school-outline" size={36} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                  <AppText tone="secondary" style={{ textAlign: 'center' }}>
                    No departments match "{query}".
                  </AppText>
                </View>
              ) : (
                filteredGroups.map((group) => (
                  <View key={group.faculty} style={{ marginBottom: spacing.md }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.divider,
                        marginBottom: spacing.xs,
                      }}
                    >
                      <AppText
                        variant="caption"
                        weight="bold"
                        tone="brand"
                        style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                      >
                        {group.faculty}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {group.departments.length} depts
                      </AppText>
                    </View>

                    {group.departments.map((dept) => {
                      const isSelected = dept === value;
                      return (
                        <Pressable
                          key={dept}
                          onPress={() => handleSelect(dept, group.faculty)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: spacing.sm,
                            paddingHorizontal: spacing.xs,
                            borderRadius: radius.sm,
                            backgroundColor: isSelected ? colors.pastelPrimaryBg : 'transparent',
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <AppText tone={isSelected ? 'brand' : 'primary'} weight={isSelected ? 'bold' : 'regular'}>
                              {dept}
                            </AppText>
                            <AppText variant="caption" tone="secondary">
                              {group.code ? `${group.code} • ` : ''}{group.faculty}
                            </AppText>
                          </View>
                          {isSelected ? <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
