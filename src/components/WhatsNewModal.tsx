import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';

interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

/** Newest first. Bump CURRENT_CHANGELOG_VERSION when adding an entry so the "New" badge knows to show again. */
export const CURRENT_CHANGELOG_VERSION = '2026.10.3';

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026.10.3',
    date: 'October 2026',
    items: [
      'Notification preferences now genuinely control what you receive - muting a category actually stops that push, on every device.',
      'Pause your account instead of deleting it: Settings > Privacy & Data > Deactivate my account. Log back in any time to pick up where you left off.',
      'A "Your Devices" list in Settings shows every device registered for notifications, with one-tap removal.',
      'Marketplace listings and job postings can now be reported directly from their card.',
      'Campus staff can step in on a mentorship pairing that has gone wrong.',
    ],
  },
  {
    version: '2026.10.2',
    date: 'October 2026',
    items: [
      'New: an AI assistant in Settings > Help & Support answers common questions instantly, and opens a support ticket automatically for anything it can\'t resolve.',
      'A dedicated "Feedback" category for support tickets, separate from bug reports.',
      'Admins can now see relevant crash/error history right inside a support ticket.',
    ],
  },
  {
    version: '2026.10.1',
    date: 'October 2026',
    items: [
      'Liking or commenting on a post now notifies its author.',
      'Alumni Directory: filter by graduation year, industry, company and location.',
      'Event waitlists - join when an event is full, get automatically promoted if a spot opens up.',
      'Campus giving campaigns, with admin review before they go live.',
      'Job postings from students and alumni are now reviewed before appearing on the career board.',
    ],
  },
];

export function WhatsNewModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: spacing.lg,
            width: '100%',
            maxWidth: 520,
            maxHeight: '85%',
            gap: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={18} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                What's New
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {CHANGELOG.map((entry, idx) => (
              <View key={entry.version} style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppText variant="bodySmall" weight="bold" tone="brand">
                    {entry.date}
                  </AppText>
                  {idx === 0 ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandPrimary }}>
                      <AppText variant="caption" weight="bold" style={{ color: '#FFFFFF', fontSize: 10 }}>
                        LATEST
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <View style={{ gap: 6 }}>
                  {entry.items.map((item, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <Ionicons name="ellipse" size={5} color={colors.textSecondary} style={{ marginTop: 7 }} />
                      <AppText variant="bodySmall" style={{ flex: 1, lineHeight: 19 }}>
                        {item}
                      </AppText>
                    </View>
                  ))}
                </View>
                {idx < CHANGELOG.length - 1 ? (
                  <View style={{ height: 1, backgroundColor: colors.border, marginTop: spacing.sm }} />
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
