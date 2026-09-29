import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { JobListing, JobQuestion } from '@/api/types';
import { applyToJob, listJobQuestions, uploadResume } from '@/api/jobApplications';
import { getMyProfile } from '@/api/profile';
import { pickResume, PickedResume } from '@/utils/pickResume';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { getFriendlyErrorMessage } from '@/utils/errors';

/**
 * The shared in-app application form (CV, cover note, portfolio link, dynamic
 * screening questions). Used both by JobCard.tsx (student/alumni feed) and
 * the Alumni Career Portal's own job detail modal, so the ATS flow is the
 * same everywhere a job accepts in-app applications.
 */
export function JobApplyModal({
  visible,
  job,
  onClose,
  onApplied,
}: {
  visible: boolean;
  job: JobListing;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();

  const [coverNote, setCoverNote] = useState('');
  const [portfolioLink, setPortfolioLink] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [questions, setQuestions] = useState<JobQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const [savedResumeUrl, setSavedResumeUrl] = useState<string | null>(null);
  const [newResume, setNewResume] = useState<PickedResume | null>(null);
  const [pickingResume, setPickingResume] = useState(false);
  const [useSavedResume, setUseSavedResume] = useState(true);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setCoverNote('');
    setPortfolioLink('');
    setAnswers({});
    setNewResume(null);
    Promise.all([listJobQuestions(job.id), getMyProfile(user ?? undefined)])
      .then(([qs, profile]) => {
        if (cancelled) return;
        setQuestions(qs);
        setSavedResumeUrl(profile.resumeUrl ?? null);
        setUseSavedResume(!!profile.resumeUrl);
      })
      .catch(() => {
        // Non-fatal: the form still works with no questions / no saved résumé.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, job.id, user]);

  async function handlePickResume() {
    setPickingResume(true);
    try {
      const picked = await pickResume();
      if (picked) {
        setNewResume(picked);
        setUseSavedResume(false);
      }
    } catch {
      toast.error('Could not open the file picker. Please try again.');
    } finally {
      setPickingResume(false);
    }
  }

  function updateAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmitApplication() {
    const missingRequired = questions.find((q) => q.isRequired && !answers[q.id]?.trim());
    if (missingRequired) {
      toast.error(`Please answer: "${missingRequired.questionText}"`);
      return;
    }
    if (portfolioLink.trim() && !isSafeHttpUrl(portfolioLink.trim())) {
      toast.error('The portfolio link must be a valid http:// or https:// URL.');
      return;
    }

    setSubmitting(true);
    try {
      let resumeUrl: string | undefined;
      if (!useSavedResume && newResume) {
        resumeUrl = await uploadResume(newResume.source);
      } else if (useSavedResume && savedResumeUrl) {
        resumeUrl = savedResumeUrl;
      }

      await applyToJob(job.id, {
        resumeUrl,
        coverNote: coverNote.trim() || undefined,
        portfolioUrl: portfolioLink.trim() || undefined,
        answers,
      });

      haptics.success();
      toast.success(`Applied to ${job.title} at ${job.company}!`);
      onApplied();
    } catch (err: any) {
      haptics.error();
      toast.error(getFriendlyErrorMessage(err, 'Could not submit your application. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
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
                <AppText variant="h3" weight="bold">
                  Apply: {job.title}
                </AppText>
                <AppText tone="secondary" variant="bodySmall">
                  {job.company} • {job.location}
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flexShrink: 0, padding: 4 }} onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator color={colors.brandPrimary} />
              </View>
            ) : (
              <>
                <View style={{ backgroundColor: colors.divider, padding: spacing.md, borderRadius: 14, marginBottom: spacing.md }}>
                  <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 2 }}>
                    VERIFIED CANDIDATE
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    This creates a real, trackable application the poster reviews directly - not just a notification.
                  </AppText>
                </View>

                <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
                  {/* Résumé */}
                  <View>
                    <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                      Résumé / CV
                    </AppText>
                    {savedResumeUrl && (
                      <Pressable
                        onPress={() => setUseSavedResume(true)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          padding: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: useSavedResume ? colors.brandPrimary : colors.border,
                          backgroundColor: useSavedResume ? colors.pastelPrimaryBg : colors.background,
                          marginBottom: 6,
                        }}
                      >
                        <Ionicons name={useSavedResume ? 'radio-button-on' : 'radio-button-off'} size={18} color={useSavedResume ? colors.brandPrimary : colors.textSecondary} />
                        <AppText variant="caption" weight="bold" style={{ flex: 1 }}>
                          Use my saved CV on file
                        </AppText>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={handlePickResume}
                      disabled={pickingResume}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        padding: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: !useSavedResume && newResume ? colors.brandPrimary : colors.border,
                        backgroundColor: !useSavedResume && newResume ? colors.pastelPrimaryBg : colors.background,
                      }}
                    >
                      <Ionicons
                        name={pickingResume ? 'hourglass-outline' : 'document-attach-outline'}
                        size={18}
                        color={!useSavedResume && newResume ? colors.brandPrimary : colors.textSecondary}
                      />
                      <AppText variant="caption" weight="bold" numberOfLines={1} style={{ flex: 1 }}>
                        {newResume ? newResume.name : pickingResume ? 'Opening picker…' : 'Upload a résumé (PDF or Word)'}
                      </AppText>
                    </Pressable>
                    {!savedResumeUrl && !newResume && (
                      <AppText variant="caption" tone="secondary" style={{ marginTop: 4 }}>
                        Optional, but strongly recommended - and it stays saved for future applications.
                      </AppText>
                    )}
                  </View>

                  <View>
                    <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                      Cover Note / Pitch (Optional)
                    </AppText>
                    <TextInput accessibilityLabel="Introduce yourself and explain why you're a great fit for this role"
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
                    <TextInput accessibilityLabel="https://github.com/"
                      value={portfolioLink}
                      onChangeText={setPortfolioLink}
                      placeholder="https://github.com/..."
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
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

                  {questions.length > 0 && (
                    <View style={{ gap: spacing.sm }}>
                      <AppText variant="caption" weight="bold" tone="secondary">
                        SCREENING QUESTIONS
                      </AppText>
                      {questions.map((q) => (
                        <View key={q.id}>
                          <AppText variant="caption" weight="bold" style={{ marginBottom: 6 }}>
                            {q.questionText}
                            {q.isRequired ? ' *' : ''}
                          </AppText>
                          {q.questionType === 'yes_no' ? (
                            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                              {(['yes', 'no'] as const).map((opt) => (
                                <Pressable
                                  key={opt}
                                  onPress={() => updateAnswer(q.id, opt)}
                                  style={{
                                    flex: 1,
                                    paddingVertical: 10,
                                    borderRadius: 12,
                                    borderWidth: 1,
                                    alignItems: 'center',
                                    borderColor: answers[q.id] === opt ? colors.brandPrimary : colors.border,
                                    backgroundColor: answers[q.id] === opt ? colors.pastelPrimaryBg : colors.background,
                                  }}
                                >
                                  <AppText variant="caption" weight="bold" tone={answers[q.id] === opt ? 'brand' : 'secondary'}>
                                    {opt === 'yes' ? 'Yes' : 'No'}
                                  </AppText>
                                </Pressable>
                              ))}
                            </View>
                          ) : (
                            <TextInput
                              accessibilityLabel={q.questionText}
                              value={answers[q.id] || ''}
                              onChangeText={(t) => updateAnswer(q.id, t)}
                              placeholder="Your answer..."
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
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <AppButton label="Cancel" variant="ghost" fullWidth onPress={onClose} />
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
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
