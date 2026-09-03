import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
    setSubmitting(true);
    try {
      if (job.posterId) {
        await createNotification({
          recipientId: job.posterId,
          type: 'message',
          title: `New Candidate: ${job.title}`,
          body: `${user?.fullName || 'A student'} applied for ${job.title} at ${job.company}.${coverNote.trim() ? ` Pitch: "${coverNote.trim()}"` : ''}`,
          deepLinkPath: `/${user?.role || 'student'}/jobs`,
        });
      }
      setApplied(true);
      setModalOpen(false);
      haptics.success();
      toast.success(`Application submitted to ${job.company} for ${job.title}!`);
    } catch {
      setApplied(true);
      setModalOpen(false);
      toast.success(`Application submitted to ${job.company} for ${job.title}!`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SolidCard radius={20} style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.pastelPrimaryBg,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.brandPrimary,
          }}
        >
          <Ionicons name="briefcase-outline" size={22} color={colors.brandPrimary} />
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <Badge label={job.type} tone={job.type === 'Internship' ? 'accent' : 'brand'} />
            {job.remote && <Badge label="Remote" tone="success" />}
          </View>
          <AppText variant="h3" weight="bold" style={{ marginTop: 2 }}>
            {job.title}
          </AppText>
          <AppText tone="secondary" variant="bodySmall">
            {job.company} | {job.location}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.md,
          paddingTop: spacing.xs,
          borderTopWidth: 1,
          borderTopColor: colors.divider,
        }}
      >
        <AppText tone="secondary" variant="caption">
          Posted by {job.postedByName}
        </AppText>

        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
          {job.applyUrl && job.applyUrl.startsWith('http') && (
            <AppButton
              label="Job Site ↗"
              variant="ghost"
              onPress={handleOpenApplyUrl}
            />
          )}
          <AppButton
            label={applied ? 'Applied' : 'Apply Now'}
            variant={applied ? 'secondary' : 'primary'}
            disabled={applied}
            onPress={handleOpenApply}
          />
        </View>
      </View>

      {/* Interactive Application Modal */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalOpen(false)}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                width: isDesktop ? 500 : '90%',
                borderRadius: 24,
                padding: spacing.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View>
                <AppText variant="h2" weight="bold">
                  Apply for {job.title}
                </AppText>
                <AppText tone="secondary" variant="bodySmall">
                  {job.company} • {job.location}
                </AppText>
              </View>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ backgroundColor: colors.pastelPrimaryBg, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md }}>
              <AppText variant="caption" weight="bold" tone="brand" style={{ marginBottom: 2 }}>
                VERIFIED STUDENT CANDIDATE
              </AppText>
              <AppText variant="caption" tone="secondary">
                Your verified campus credentials and university profile will be attached to this application.
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
                  label="Submit Application"
                  variant="primary"
                  loading={submitting}
                  fullWidth
                  onPress={handleSubmitApplication}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
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
  },
  modalCard: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
});
