import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { LAUNCH_INSTITUTIONS } from '@/api/institutions';

interface ChangeWorkspaceScopeModalProps {
  visible: boolean;
  onClose: () => void;
  homeInstitution: string;
  homeInstitutionCode: string;
  scope: 'campus' | 'global';
  onSelectScope: (scope: 'campus' | 'global') => void;
}

/** Ported from the "Change Workspace Scope" modal (institution switcher pill). */
export function ChangeWorkspaceScopeModal({
  visible,
  onClose,
  homeInstitution,
  homeInstitutionCode,
  scope,
  onSelectScope,
}: ChangeWorkspaceScopeModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [guestWorkspaces, setGuestWorkspaces] = useState(() =>
    LAUNCH_INSTITUTIONS.filter((inst) => inst.code !== homeInstitutionCode).map((inst) => ({
      code: inst.code,
      name: inst.name,
      description: `Explore ${inst.code} as a guest workspace`,
    })),
  );

  function removeGuest(code: string) {
    setGuestWorkspaces((prev) => prev.filter((w) => w.code !== code));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessible={false} />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '85%' }}>
          <View style={{ alignItems: 'center', marginBottom: spacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="globe" size={20} color={colors.brandPrimary} />
            <AppText variant="h2" weight="bold">
              Change Workspace Scope
            </AppText>
          </View>
          <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
            Select your current viewing scope. Highlight regional cross-university feeds or
            filter strictly for your local campus.
          </AppText>

          <ScrollView showsVerticalScrollIndicator={false}>
            <ScopeOption
              icon="school"
              title="My Campus Workspace"
              subtitle={homeInstitution}
              selected={scope === 'campus'}
              onPress={() => {
                onSelectScope('campus');
                onClose();
              }}
            />
            <ScopeOption
              icon="globe-outline"
              title="All Lioris Global Feed 🌍"
              subtitle="See posts & announcements cross-country"
              selected={scope === 'global'}
              onPress={() => {
                onSelectScope('global');
                onClose();
              }}
            />

            <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg }} />

            <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1, marginBottom: spacing.sm }}>
              EXPLORE OTHER CAMPUS WORKSPACES
            </AppText>
            {guestWorkspaces.map((w) => (
              <View
                key={w.code}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  backgroundColor: colors.divider,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginBottom: spacing.sm,
                }}
              >
                <Ionicons name="school-outline" size={20} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" variant="bodySmall">
                    {w.name}
                  </AppText>
                  <AppText tone="secondary" variant="caption">
                    {w.description}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => removeGuest(w.code)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${w.name} guest workspace`}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.critical} />
                </Pressable>
              </View>
            ))}

            <View style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
              <AppButton
                label="+ Create Campus Workspace"
                variant="secondary"
                onPress={() =>
                  Alert.alert(
                    'Not available yet',
                    'Creating a custom guest workspace isn\u2019t built in this preview \u2014 the campuses above are pre-loaded from Lioris\u2019s launch universities.',
                  )
                }
                fullWidth
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ScopeOption({
  icon,
  title,
  subtitle,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${subtitle}`}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: selected ? colors.pastelPrimaryBg : colors.divider,
          borderRadius: radius.md,
          padding: spacing.md,
          marginBottom: spacing.sm,
        }}
      >
        <Ionicons name={icon} size={20} color={selected ? colors.brandPrimary : colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <AppText weight="bold" tone={selected ? 'brand' : 'primary'}>
            {title}
          </AppText>
          <AppText tone="secondary" variant="caption">
            {subtitle}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
