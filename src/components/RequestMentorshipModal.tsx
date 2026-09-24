import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { AppTextField } from './AppTextField';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/auth/AuthContext';
import { MentorProfile } from '@/api/types';
import { requestMentorship, RequestMentorshipPayload } from '@/api/mentorship';
import { uploadMediaFile } from '@/api/storage';

const FOCUS_TRACKS = [
  'Career Guidance',
  'Resume & Interview Prep',
  'Technical Skills & Code',
  'Graduate School & Research',
  'Startup & Entrepreneurship',
  'Academic Mentorship',
] as const;

const ACADEMIC_LEVELS = ['100L', '200L', '300L', '400L', '500L', '600L', 'PGD', 'Masters', 'PhD'] as const;

const CADENCE_OPTIONS = [
  'Bi-weekly 30m calls',
  'Monthly check-in',
  'Async / Chat feedback',
  'Flexible',
] as const;

interface RequestMentorshipModalProps {
  visible: boolean;
  mentor: MentorProfile;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RequestMentorshipModal({
  visible,
  mentor,
  onClose,
  onSuccess,
}: RequestMentorshipModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();

  const [track, setTrack] = useState<string>(FOCUS_TRACKS[0]);
  const [academicLevel, setAcademicLevel] = useState<string>(ACADEMIC_LEVELS[2]);
  const [pitch, setPitch] = useState('');
  const [goals, setGoals] = useState('');
  const [cadence, setCadence] = useState<string>(CADENCE_OPTIONS[0]);
  const [planOutline, setPlanOutline] = useState('');

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size?: number;
    mimeType?: string;
    fileOrUri: any;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
      scale.value = withSpring(1, { damping: 16, stiffness: 220 });
    } else {
      opacity.value = 0;
      scale.value = 0.92;
    }
  }, [visible, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  async function handlePickFile() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt,image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        setSelectedFile({
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/pdf',
          fileOrUri: file,
        });
      };
      input.click();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'image/*',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType || 'application/pdf',
          fileOrUri: asset.uri,
        });
      }
    } catch (err: any) {
      console.warn('[RequestMentorshipModal] File pick error:', err);
      toast.error('Could not select document. Please try again.');
    }
  }

  async function handleSubmit() {
    if (!pitch.trim()) {
      toast.error('Please write a short note introducing yourself and your background.');
      return;
    }

    setSubmitting(true);
    let uploadedDocUrl: string | undefined = undefined;
    let uploadedDocName: string | undefined = undefined;

    try {
      if (selectedFile && user?.id) {
        setUploadingDoc(true);
        try {
          uploadedDocUrl = await uploadMediaFile(
            'resources',
            selectedFile.fileOrUri,
            'mentorship_docs',
            selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_'),
          );
          uploadedDocName = selectedFile.name;
        } catch (uploadErr: any) {
          console.warn('[RequestMentorshipModal] Document upload warning:', uploadErr);
          toast.info('Document upload could not complete, sending request with text proposal.');
        } finally {
          setUploadingDoc(false);
        }
      }

      const payload: RequestMentorshipPayload = {
        mentorId: mentor.id,
        focusArea: track,
        academicLevel,
        pitch: pitch.trim(),
        goals: goals.trim() || undefined,
        cadence,
        planOutline: planOutline.trim() || undefined,
        documentUrl: uploadedDocUrl,
        documentName: uploadedDocName,
      };

      await requestMentorship(payload);
      toast.success(`Mentorship proposal submitted to ${mentor.fullName}!`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not submit mentorship proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isDesktop ? spacing.xl : spacing.md,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[{ width: '100%', maxWidth: 580, maxHeight: '92%' }, animatedStyle]}>
          <SolidCard radius={20} style={{ width: '100%', maxHeight: '100%', padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
              }}
            >
              <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                <AppText variant="h3" weight="bold">
                  Request Mentorship
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  Present your goals and proposal to {mentor.fullName}
                </AppText>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                }}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Scrollable Form Body */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, gap: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Mentor Preview Card */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                }}
              >
                <Avatar name={mentor.fullName} uri={mentor.avatarUrl} size={46} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AppText variant="bodySmall" weight="bold">
                      {mentor.fullName}
                    </AppText>
                    <Badge label="Verified Mentor" tone="brand" />
                  </View>
                  <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                    {[mentor.company, mentor.department].filter(Boolean).join(' • ') || 'Alumni Fellow'}
                  </AppText>
                </View>
              </View>

              {/* 1. Mentorship Focus Track */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  1. Focus Track & Guidance Needed *
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {FOCUS_TRACKS.map((t) => {
                    const selected = track === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setTrack(t)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
                          backgroundColor: selected ? colors.brandPrimary + '20' : 'transparent',
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={selected ? 'bold' : 'regular'}
                          style={{ color: selected ? colors.brandPrimary : colors.textPrimary }}
                        >
                          {t}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 2. Academic Level */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  2. Your Current Academic Standing *
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {ACADEMIC_LEVELS.map((lvl) => {
                    const selected = academicLevel === lvl;
                    return (
                      <Pressable
                        key={lvl}
                        onPress={() => setAcademicLevel(lvl)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
                          backgroundColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={selected ? 'bold' : 'regular'}
                          style={{ color: selected ? '#FFFFFF' : colors.textPrimary }}
                        >
                          {lvl}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 3. Statement of Purpose / Pitch */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  3. Statement of Purpose & Introduction *
                </AppText>
                <AppTextField
                  label=""
                  placeholder="Introduce yourself, what you are studying, and why you believe this mentor is the ideal guide for your journey..."
                  value={pitch}
                  onChangeText={setPitch}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* 4. Concrete Goals */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  4. Concrete Goals for this Mentorship
                </AppText>
                <AppTextField
                  label=""
                  placeholder="e.g. Land a summer internship, prepare for technical interviews, or review my capstone architecture..."
                  value={goals}
                  onChangeText={setGoals}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* 5. Proposed Cadence */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  5. Proposed Meeting Cadence
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {CADENCE_OPTIONS.map((c) => {
                    const selected = cadence === c;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCadence(c)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: selected ? colors.brandPrimary : isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
                          backgroundColor: selected ? colors.brandPrimary + '20' : 'transparent',
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={selected ? 'bold' : 'regular'}
                          style={{ color: selected ? colors.brandPrimary : colors.textPrimary }}
                        >
                          {c}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 6. Proposed Mentorship Growth Plan */}
              <View>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  6. Proposed Mentorship Plan / Roadmap (Optional)
                </AppText>
                <AppTextField
                  label=""
                  placeholder="e.g. Month 1: Resume & Portfolio review; Month 2: Mock technical interviews; Month 3: Job applications..."
                  value={planOutline}
                  onChangeText={setPlanOutline}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* 7. Supporting Document Upload */}
              <View
                style={{
                  padding: 14,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ionicons name="document-attach-outline" size={18} color={colors.brandPrimary} />
                  <AppText variant="caption" weight="bold" tone="primary">
                    Attach Supporting Document (CV, Resume, or Proposal)
                  </AppText>
                </View>
                <AppText tone="secondary" variant="caption" style={{ fontSize: 11, marginBottom: 10 }}>
                  Mentors are 85% more likely to accept requests with a verified resume or project proposal attached.
                </AppText>

                {selectedFile ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: colors.brandPrimary + '15',
                      borderWidth: 1,
                      borderColor: colors.brandPrimary + '35',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                      <Ionicons name="document-text" size={20} color={colors.brandPrimary} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText variant="caption" weight="bold">
                          {selectedFile.name}
                        </AppText>
                        {selectedFile.size ? (
                          <AppText tone="secondary" variant="caption" style={{ fontSize: 11 }}>
                            {formatFileSize(selectedFile.size)}
                          </AppText>
                        ) : null}
                      </View>
                    </View>

                    <Pressable
                      onPress={() => setSelectedFile(null)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove document"
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.critical} />
                    </Pressable>
                  </View>
                ) : (
                  <AppButton
                    label="Choose Document (.pdf, .doc, .docx)"
                    variant="secondary"
                    size="sm"
                    onPress={handlePickFile}
                  />
                )}
              </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 20,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#FFFFFF',
              }}
            >
              <AppButton label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
              <AppButton
                label={submitting ? (uploadingDoc ? 'Uploading document...' : 'Submitting proposal...') : 'Submit Mentorship Proposal'}
                onPress={handleSubmit}
                loading={submitting}
              />
            </View>
          </SolidCard>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
