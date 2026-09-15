import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { FACULTIES } from '@/data/departments';
import { haptics } from '@/utils/haptics';

interface DepartmentPickerProps {
  value: string | null;
  onChange: (department: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Searchable, faculty-grouped department picker - replaces the flat 8-chip
 * list onboarding used to show (Computer Science, Engineering, Business,
 * Biology, Psychology, Economics, Art & Design, Other) with the full
 * ALL_DEPARTMENTS list (src/data/departments.ts). A flat chip row doesn't
 * scale to ~70 options, so this is a field that opens a modal with a search
 * box instead.
 */
export function DepartmentPicker({ value, onChange, label = 'Department', placeholder = 'Search or select your department' }: DepartmentPickerProps) {
  const { colors, spacing, radius, minTouchTarget } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredFaculties = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FACULTIES;
    return FACULTIES.map((group) => ({
      faculty: group.faculty,
      departments: group.departments.filter((d) => d.toLowerCase().includes(q)),
    })).filter((group) => group.departments.length > 0);
  }, [query]);

  function handleSelect(department: string) {
    haptics.light();
    onChange(department);
    setQuery('');
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: '80%',
              paddingTop: spacing.lg,
              paddingHorizontal: spacing.lg,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <AppText variant="h2" weight="bold">
                Select department
              </AppText>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

            <AppTextField
              placeholder="Search departments..."
              value={query}
              onChangeText={setQuery}
              leftIcon="search"
              autoFocus
            />

            <ScrollView style={{ marginBottom: spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {filteredFaculties.length === 0 ? (
                <AppText tone="secondary" style={{ paddingVertical: spacing.lg, textAlign: 'center' }}>
                  No departments match "{query}".
                </AppText>
              ) : (
                filteredFaculties.map((group) => (
                  <View key={group.faculty} style={{ marginBottom: spacing.md }}>
                    <AppText
                      variant="caption"
                      weight="bold"
                      tone="secondary"
                      style={{ textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.xs }}
                    >
                      {group.faculty}
                    </AppText>
                    {group.departments.map((dept) => {
                      const isSelected = dept === value;
                      return (
                        <Pressable
                          key={dept}
                          onPress={() => handleSelect(dept)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: spacing.sm,
                          }}
                        >
                          <AppText tone={isSelected ? 'brand' : 'primary'} weight={isSelected ? 'bold' : 'regular'}>
                            {dept}
                          </AppText>
                          {isSelected ? <Ionicons name="checkmark" size={18} color={colors.brandPrimary} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
