import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { createJob, updateJob, CreateJobQuestionInput } from '@/api/jobs';
import { JobListing } from '@/api/types';
import { generateUUID } from '@/utils/uuid';
import { haptics } from '@/utils/haptics';
import { isSafeHttpUrl } from '@/utils/safeUrl';
import { getFriendlyErrorMessage } from '@/utils/errors';

interface CreateJobModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after a successful create OR edit, so callers don't need two separate handlers. */
  onCreated: () => void;
  /** When set, the modal edits this posting in place instead of creating a new one - see "My Postings". */
  job?: JobListing | null;
}

const JOB_TYPES = ['Full-time', 'Internship', 'Part-time', 'Contract'] as const;

export function CreateJobModal({ visible, onClose, onCreated, job }: CreateJobModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const isEditMode = !!job;
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState<(typeof JOB_TYPES)[number]>('Full-time');
  const [isRemote, setIsRemote] = useState(false);
  const [salary, setSalary] = useState('');
  const [applyUrl, setApplyUrl] = useState('');
  const [description, setDescription] = useState('');
  const [acceptsInApp, setAcceptsInApp] = useState(true);
  const [questions, setQuestions] = useState<{ id: string; text: string; type: 'text' | 'yes_no'; required: boolean }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Prefill from the posting being edited every time the modal opens for it.
  // Screening questions aren't editable here (they're a separate table with
  // their own insert path in createJob) - existing ones are left untouched.
  useEffect(() => {
    if (!visible) return;
    if (job) {
      setTitle(job.title);
      setCompany(job.company);
      setLocation(job.location);
      setJobType((JOB_TYPES as readonly string[]).includes(job.type) ? (job.type as (typeof JOB_TYPES)[number]) : 'Full-time');
      setIsRemote(job.remote);
      setSalary(job.salary || '');
      setApplyUrl(job.applyUrl || '');
      setDescription(job.description || '');
      setAcceptsInApp(job.acceptsInAppApplications);
      setQuestions([]);
      setErrorMessage(null);
    } else {
      reset();
    }
  }, [visible, job?.id]);

  function addQuestion() {
    haptics.light();
    setQuestions((prev) => [...prev, { id: generateUUID(), text: '', type: 'text', required: true }]);
  }

  function removeQuestion(id: string) {
    haptics.light();
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function updateQuestion(id: string, patch: Partial<{ text: string; type: 'text' | 'yes_no'; required: boolean }>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  // The error banner renders at the very top of the form, above every
  // field - invisible to anyone who has scrolled down to the "Publish"
  // button at the bottom when validation fails. Scroll back up whenever a
  // new error appears so it's actually seen instead of looking like the
  // button silently did nothing.
  function showError(message: string) {
    setErrorMessage(message);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function reset() {
    setTitle('');
    setCompany('');
    setLocation('');
    setJobType('Full-time');
    setIsRemote(false);
    setSalary('');
    setApplyUrl('');
    setDescription('');
    setAcceptsInApp(true);
    setQuestions([]);
    setErrorMessage(null);
  }

  async function handleSubmit() {
    setErrorMessage(null);
    if (!title.trim()) {
      showError('Please enter a role title.');
      haptics.error();
      return;
    }
    if (!company.trim()) {
      showError('Please enter the hiring company or organization.');
      haptics.error();
      return;
    }
    if (!location.trim()) {
      showError('Please specify the location (e.g. Lagos, Ibadan, Remote).');
      haptics.error();
      return;
    }
    if (!acceptsInApp && !applyUrl.trim()) {
      showError('Add an external application link, or turn on "Accept applications in Lioris".');
      haptics.error();
      return;
    }
    if (applyUrl.trim() && !isSafeHttpUrl(applyUrl.trim())) {
      showError('The application link must be a valid http:// or https:// URL.');
      haptics.error();
      return;
    }

    setSubmitting(true);
    haptics.medium();

    try {
      if (isEditMode && job) {
        await updateJob(job.id, {
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          type: jobType,
          remote: isRemote,
          salary: salary.trim() || undefined,
          applyUrl: applyUrl.trim() || undefined,
          acceptsInAppApplications: acceptsInApp,
          description: description.trim() || undefined,
        });
        haptics.success();
        Alert.alert('Posting Updated', `"${title.trim()}" has been updated.`);
      } else {
        const cleanQuestions: CreateJobQuestionInput[] = questions
          .filter((q) => q.text.trim())
          .map((q) => ({ text: q.text.trim(), type: q.type, required: q.required }));

        await createJob({
          title: title.trim(),
          company: company.trim(),
          location: location.trim(),
          type: jobType,
          remote: isRemote,
          salary: salary.trim() || undefined,
          applyUrl: applyUrl.trim() || undefined,
          acceptsInAppApplications: acceptsInApp,
          questions: cleanQuestions,
          description: description.trim() || undefined,
        });

        haptics.success();
        Alert.alert('Opening Published', `"${title.trim()}" at ${company.trim()} is now visible on the campus careers board.`);
        reset();
      }
      onCreated();
      onClose();
    } catch (err: any) {
      haptics.error();
      showError(getFriendlyErrorMessage(err, isEditMode ? 'Failed to update this posting. Please try again.' : 'Failed to publish job opening. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent={isDesktop} animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: isDesktop ? 'rgba(0, 0, 0, 0.65)' : colors.background,
          justifyContent: isDesktop ? 'center' : 'flex-start',
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingTop: isDesktop ? spacing.lg : Math.max(insets.top, 16),
          paddingHorizontal: isDesktop ? spacing.lg : spacing.md,
          paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, 16),
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : '100%',
            maxWidth: isDesktop ? 620 : undefined,
            maxHeight: isDesktop ? '90%' : undefined,
            borderRadius: isDesktop ? 24 : 0,
            padding: isDesktop ? spacing.xl : 0,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: isDesktop ? spacing.md : 40, paddingHorizontal: isDesktop ? 0 : spacing.xs }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
              <View>
                <AppText variant="h1" weight="bold">
                  {isEditMode ? 'Edit Posting' : 'Post Opportunity'}
                </AppText>
 <AppText tone="secondary" variant="caption" style={{ marginTop: 2 }}>
 {isEditMode ? 'Update the details of this posting' : 'Share internships, graduate roles & referrals'}
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
 Remote Friendly 
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

 {/* Accept in-app applications */}
 <Pressable
 onPress={() => {
 haptics.light();
 setAcceptsInApp(!acceptsInApp);
 if (errorMessage) setErrorMessage(null);
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
 Accept Applications in Lioris
 </AppText>
 <AppText tone="secondary" variant="caption">
 Candidates apply with their CV and answer your screening questions right here
 </AppText>
 </View>
 <Ionicons
 name={acceptsInApp ? 'checkbox' : 'square-outline'}
 size={24}
 color={acceptsInApp ? colors.brandPrimary : colors.textSecondary}
 />
 </Pressable>

 <AppTextField
 label={acceptsInApp ? 'External Application Link (Optional)' : 'Application Link'}
 placeholder="https://company.com/apply"
 value={applyUrl}
 onChangeText={(t) => {
 setApplyUrl(t);
 if (errorMessage) setErrorMessage(null);
 }}
 autoCapitalize="none"
 />

 {acceptsInApp && !isEditMode && (
 <View style={{ marginBottom: spacing.md }}>
 <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs, marginTop: spacing.sm }}>
 <AppText weight="bold" variant="caption">
 SCREENING QUESTIONS (OPTIONAL)
 </AppText>
 <Pressable
 accessibilityRole="button"
 accessibilityLabel="Add screening question"
 onPress={addQuestion}
 hitSlop={8}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
 >
 <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
 <AppText variant="caption" weight="bold" tone="brand">
 Add Question
 </AppText>
 </Pressable>
 </View>

 {questions.map((q, idx) => (
 <View
 key={q.id}
 style={{
 backgroundColor: colors.surface,
 borderWidth: 1,
 borderColor: colors.border,
 borderRadius: radius.md,
 padding: spacing.sm,
 marginBottom: spacing.sm,
 gap: spacing.xs,
 }}
 >
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
 <View style={{ flex: 1 }}>
 <AppTextField
 label={`Question ${idx + 1}`}
 placeholder="e.g. Are you available to start immediately?"
 value={q.text}
 onChangeText={(t) => updateQuestion(q.id, { text: t })}
 />
 </View>
 <Pressable
 accessibilityRole="button"
 accessibilityLabel="Remove question"
 onPress={() => removeQuestion(q.id)}
 hitSlop={8}
 style={{ padding: 6, marginTop: 14 }}
 >
 <Ionicons name="trash-outline" size={18} color={colors.critical} />
 </Pressable>
 </View>

 <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
 {(['text', 'yes_no'] as const).map((t) => (
 <Pressable
 key={t}
 onPress={() => updateQuestion(q.id, { type: t })}
 style={{
 paddingHorizontal: spacing.sm,
 paddingVertical: 6,
 borderRadius: radius.pill,
 borderWidth: 1,
 borderColor: q.type === t ? colors.brandPrimary : colors.border,
 backgroundColor: q.type === t ? colors.pastelPrimaryBg : 'transparent',
 }}
 >
 <AppText variant="caption" weight="bold" tone={q.type === t ? 'brand' : 'secondary'}>
 {t === 'text' ? 'Short answer' : 'Yes / No'}
 </AppText>
 </Pressable>
 ))}
 <Pressable
 onPress={() => updateQuestion(q.id, { required: !q.required })}
 style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
 >
 <Ionicons
 name={q.required ? 'checkbox' : 'square-outline'}
 size={16}
 color={q.required ? colors.brandPrimary : colors.textSecondary}
 />
 <AppText variant="caption" tone="secondary">
 Required
 </AppText>
 </Pressable>
 </View>
 </View>
 ))}
 </View>
 )}

 <AppTextField
 label="Role Description & Requirements"
 placeholder="Describe key responsibilities, qualifications, and benefits..."
 value={description}
 onChangeText={setDescription}
 multiline
 />

 <View style={{ marginTop: spacing.lg }}>
 <AppButton
 label={isEditMode ? (submitting ? 'Saving...' : 'Save Changes') : (submitting ? 'Publishing...' : 'Publish Opening ')}
 onPress={handleSubmit}
 disabled={submitting}
 />
 </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>
);
}
