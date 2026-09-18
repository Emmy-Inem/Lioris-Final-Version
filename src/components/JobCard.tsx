import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { JobListing } from '@/api/types';
import { createNotification } from '@/api/notifications';
import { haptics } from '@/utils/haptics';

export function JobCard({ job }: { job: JobListing }) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [coverNote, setCoverNote] = useState('');
  const [portfolioLink, setPortfolioLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);

  function handleOpenApply() {
    haptics.light();
    setModalOpen(true);
  }

  function handleOpenApplyUrl() {
    if (job.applyUrl && (job.applyUrl.startsWith('http') || job.applyUrl.startsWith('mailto'))) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(job.applyUrl, '_blank');
      } else {
        Linking.openURL(job.applyUrl).catch(() => {});
      }
    }
  }

  async function handleSubmitApplication() {
    // NOTE: There is no application-persistence table/record in the backend -
    // this only sends a best-effort notification to the job poster. We only
    // report success when that notification actually goes through, so the
    // "Applied" state honestly reflects whether the poster was notified,
    // not a formally tracked application record.
    if (!job.posterId) {
      toast.error('This listing has no reachable poster, so interest cannot be sent right now.');
      return;
    }
    setSubmitting(true);
    try {
      await createNotification({
        recipientId: job.posterId,
        type: 'message',
        title: `New Candidate: ${job.title}`,
        body: `${user?.fullName || 'A student'} is interested in ${job.title} at ${job.company}.${coverNote.trim() ? ` Pitch: "${coverNote.trim()}"` : ''}`,
        deepLinkPath: `/(${user?.role || 'student'})/jobs`,
      });
      setApplied(true);
      setModalOpen(false);
      haptics.success();
      toast.success(`${job.company} has been notified of your interest in ${job.title}!`);
    } catch {
      haptics.error();
      toast.error('Could not notify the poster right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: 0 }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.divider,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Ionicons name="briefcase-outline" size={22} color={colors.textSecondary} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
            {job.remote && <Badge label="Remote" tone="success" />}
          </View>
          <AppText variant="h3" weight="bold" style={{ marginTop: 2 }} numberOfLines={2}>
            {job.title}
          </AppText>
          <AppText tone="secondary" variant="bodySmall" numberOfLines={1}>
            {job.company} | {job.location}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: spacing.md,
          paddingTop: spacing.xs,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        <AppText tone="secondary" variant="caption" numberOfLines={1} style={{ flexShrink: 1, minWidth: 60 }}>
          Posted by {job.postedByName}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', flexShrink: 0 }}>
          {job.applyUrl && job.applyUrl.startsWith('http') && (
            <AppButton
              label="Job Site ↗"
              variant="ghost"
              size="sm"
              onPress={handleOpenApplyUrl}
            />
          )}
          <AppButton
            label={applied ? 'Interest Sent' : 'Notify Poster of Interest'}
            variant={applied ? 'secondary' : 'primary'}
            size="sm"
            disabled={applied}
            onPress={handleOpenApply}
          />
        </View>
      </View>

      {/* Interactive Application Modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                width: '100%',
                maxWidth: 500,
                maxHeight: '90%',
                borderRadius: 24,
                padding: isDesktop ? spacing.lg : spacing.md,
                marginHorizontal: spacing.md,
                marginBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: spacing.xs }}>
                  <AppText variant="h3" weight="bold" numberOfLines={2}>
                    Notify Poster: {job.title}
                  </AppText>
                  <AppText tone="secondary" variant="bodySmall">
                    {job.company} • {job.location}
                  </AppText>
                </View>
                <Pressable style={{ flexShrink: 0, padding: 4 }} onPress={() => setModalOpen(false)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ backgroundColor: colors.divider, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 2 }}>
                  VERIFIED STUDENT CANDIDATE
                </AppText>
                <AppText variant="caption" tone="secondary">
                  This sends a notification with your profile and pitch directly to the poster - it is not a formally
                  tracked application, so following up with them is recommended.
                </AppText>
              </View>

              <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Cover Note / Pitch (Optional)
                  </AppText>
                  <TextInput
                    value={coverNote}
                    onChangeText={setCoverNote}
                    placeholder="Introduce yourself and explain why you're a great fit for this role..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                    style={{
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      padding: 12,
                      color: colors.textPrimary,
                      fontSize: 13,
                      minHeight: 80,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>

                <View>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                    Portfolio / GitHub / LinkedIn Link (Optional)
                  </AppText>
                  <TextInput
                    value={portfolioLink}
                    onChangeText={setPortfolioLink}
                    placeholder="https://github.com/..."
                    placeholderTextColor={colors.textSecondary}
                    style={{
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.textPrimary,
                      fontSize: 13,
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton label="Cancel" variant="ghost" fullWidth onPress={() => setModalOpen(false)} />
                </View>
                <View style={{ flex: 2 }}>
                  <AppButton
                    label="Notify Poster"
                    variant="primary"
                    loading={submitting}
                    fullWidth
                    onPress={handleSubmitApplication}
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SolidCard>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
});
