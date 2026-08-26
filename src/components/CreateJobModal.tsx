import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { createJob } from '@/api/jobs';
import { haptics } from '@/utils/haptics';

interface CreateJobModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const JOB_TYPES = ['Full-time', 'Internship', 'Part-time', 'Contract'] as const;

export function CreateJobModal({ visible, onClose, onCreated }: CreateJobModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState<(typeof JOB_TYPES)[number]>('Full-time');
  const [isRemote, setIsRemote] = useState(false);
  const [salary, setSalary] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setCompany('');
    setLocation('');
    setJobType('Full-time');
    setIsRemote(false);
    setSalary('');
    setApplyUrl('');
    setDescription('');
    setErrorMessage(null);
  }

  async function handleSubmit() {
    setErrorMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter a role title.');
      haptics.error();
      return;
    }
    if (!company.trim()) {
      setErrorMessage('Please enter the hiring company or organization.');
      haptics.error();
      return;
    }
    if (!location.trim()) {
      setErrorMessage('Please specify the location (e.g. Lagos, Ibadan, Remote).');
      haptics.error();
      return;
    }
    if (!applyUrl.trim()) {
      setErrorMessage('Please provide an application URL or email.');
      haptics.error();
      return;
    }

    setSubmitting(true);
    haptics.medium();

    try {
      await createJob({
        title: title.trim(),
        company: company.trim(),
        location: location.trim(),
        type: jobType,
        remote: isRemote,
        salary: salary.trim() || undefined,
        applyUrl: applyUrl.trim(),
        description: description.trim() || undefined,
      });

      haptics.success();
      Alert.alert('Opening Published 🎉', `"${title.trim()}" at ${company.trim()} is now visible on the campus careers board.`);
      reset();
      onCreated();
      onClose();
    } catch (err: any) {
      haptics.error();
      setErrorMessage(err?.message || 'Failed to publish job opening. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
          justifyContent: isDesktop ? 'center' : 'flex-start',
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingTop: isDesktop ? spacing.lg : 56,
          paddingHorizontal: spacing.lg,
          paddingBottom: isDesktop ? spacing.lg : 0,
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : undefined,
            maxWidth: isDesktop ? 620 : undefined,
            maxHeight: isDesktop ? '90%' : undefined,
            borderRadius: isDesktop ? 24 : 0,
            padding: isDesktop ? spacing.xl : 0,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <View>
                <AppText variant="h1" weight="bold">
                  Post Opportunity 💼
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
                  Share internships, graduate roles & referrals
                </AppText>
              </View>
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>

          {errorMessage ? (
            <View
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 1,
                borderColor: colors.critical,
                borderRadius: radius.md,
                padding: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <AppText tone="critical" variant="bodySmall">
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          <AppTextField
            label="Job / Role Title"
            placeholder="e.g. Graduate Software Engineer"
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              if (errorMessage) setErrorMessage(null);
            }}
          />

          <AppTextField
            label="Hiring Company / Team"
            placeholder="e.g. Flutterwave, Paystack, Microsoft"
            value={company}
            onChangeText={(t) => {
              setCompany(t);
              if (errorMessage) setErrorMessage(null);
            }}
          />

          <AppTextField
            label="Location"
            placeholder="e.g. Lagos (Victoria Island) or Ibadan"
            value={location}
            onChangeText={(t) => {
              setLocation(t);
              if (errorMessage) setErrorMessage(null);
            }}
          />

          {/* Job Type Selector */}
          <AppText weight="bold" variant="caption" style={{ marginBottom: spacing.xs, marginTop: spacing.sm }}>
            EMPLOYMENT TYPE
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
            {JOB_TYPES.map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  haptics.light();
                  setJobType(t);
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: jobType === t ? colors.brandPrimary : colors.border,
                  backgroundColor: jobType === t ? colors.pastelPrimaryBg : colors.surface,
                }}
              >
                <AppText variant="caption" weight="bold" tone={jobType === t ? 'brand' : 'secondary'}>
                  {t}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* Remote Toggle */}
          <Pressable
            onPress={() => {
              haptics.light();
              setIsRemote(!isRemote);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText weight="bold" variant="bodySmall">
                Remote Friendly 🌐
              </AppText>
              <AppText tone="secondary" variant="caption">
                Can applicants work 100% remotely from anywhere?
              </AppText>
            </View>
            <Ionicons
              name={isRemote ? 'checkbox' : 'square-outline'}
              size={24}
              color={isRemote ? colors.brandPrimary : colors.textSecondary}
            />
          </Pressable>

          <AppTextField
            label="Compensation / Salary (Optional)"
            placeholder="e.g. ₦300k - ₦450k/mo or Competitive"
            value={salary}
            onChangeText={setSalary}
          />

          <AppTextField
            label="Apply URL or Email"
            placeholder="https://company.com/apply or mailto:jobs@company.com"
            value={applyUrl}
            onChangeText={(t) => {
              setApplyUrl(t);
              if (errorMessage) setErrorMessage(null);
            }}
            autoCapitalize="none"
          />

          <AppTextField
            label="Role Description & Requirements"
            placeholder="Describe key responsibilities, qualifications, and benefits..."
            value={description}
            onChangeText={setDescription}
            multiline
          />

            <View style={{ marginTop: spacing.lg }}>
              <AppButton
                label={submitting ? 'Publishing...' : 'Publish Opening 🚀'}
                onPress={handleSubmit}
                disabled={submitting}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
