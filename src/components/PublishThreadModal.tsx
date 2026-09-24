import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { SolidCard } from './SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';
import { listCommunities } from '@/api/communities';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';

const POLL_DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '6 hours', hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toTimeInput(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD" + "HH:MM" as a LOCAL date. Returns null when either part is not a real date/time. */
function parseLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  const hour = Number(tm[1]);
  const minute = Number(tm[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/** Spells the chosen moment out in the viewer's own timezone so there is no am/pm ambiguity. */
function describeDateTime(d: Date) {
  try {
    return d.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d.toString();
  }
}

interface PublishThreadModalProps {
  visible: boolean;
  onClose: () => void;
  onPublish: (payload: {
    title: string;
    content: string;
    category: string;
    visibilityScope: 'student' | 'global';
    scopeVisibility: 'campus' | 'global';
    sponsored: boolean;
    isPinned?: boolean;
    courseTags?: string;
    postFormat: 'Thread' | 'Rapid-Fire Conversation';
    imageUrl?: string;
    videoUrl?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    pollDurationHours?: number;
    status?: 'published' | 'draft' | 'scheduled';
    scheduledAt?: string;
  }) => Promise<void>;
}

export function PublishThreadModal({ visible, onClose, onPublish }: PublishThreadModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const globalWorkspaceEnabled =
    isFeatureEnabled('global_workspace') && isFeatureEnabled('forum_global_scope');
  const isAdmin = user?.role === 'admin';
  const { data: communities = [] } = useQuery({ queryKey: ['communities'], queryFn: listCommunities });
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState('Academic');
  const [visibility, setVisibility] = useState<'Campus Only' | 'Global Reach'>('Campus Only');

  useEffect(() => {
    if (!globalWorkspaceEnabled && visibility === 'Global Reach') setVisibility('Campus Only');
  }, [globalWorkspaceEnabled, visibility]);
  const [customMediaUri, setCustomMediaUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinToTop, setPinToTop] = useState(false);

  // Poll state
  const [attachPoll, setAttachPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Option A', 'Option B']);
  const [pollDurationHours, setPollDurationHours] = useState(24);

  // Scheduling state. @react-native-community/datetimepicker is not installed, so this is a
  // hand-rolled picker (preset chips + two plain text fields) that behaves the same on web and native.
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  const scheduledDateObj = parseLocalDateTime(scheduleDate, scheduleTime);
  const scheduleWithinRange =
    !!scheduledDateObj &&
    scheduledDateObj.getTime() >= Date.now() + MIN_SCHEDULE_LEAD_MS &&
    scheduledDateObj.getTime() <= Date.now() + MAX_SCHEDULE_AHEAD_MS;

  function applySchedulePreset(d: Date) {
    haptics.light();
    setScheduleDate(toDateInput(d));
    setScheduleTime(toTimeInput(d));
    setErrorMessage(null);
  }

  function presetTonight() {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setHours(18, 0, 0, 0);
    if (d.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) d.setDate(d.getDate() + 1);
    return d;
  }

  function presetTomorrowMorning() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  function presetInAnHour() {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setSeconds(0, 0);
    return d;
  }

  // Web file input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setTopic('');
    setContent('');
    setCustomMediaUri(null);
    setAttachPoll(false);
    setPollQuestion('');
    setPollOptions(['Option A', 'Option B']);
    setPollDurationHours(24);
    setShowSchedule(false);
    setScheduleDate('');
    setScheduleTime('');
    setPinToTop(false);
    setErrorMessage(null);
  }

  // ─── Image Picker (platform-aware) ───────────────────────────────────────
  function handlePickImageWeb() {
    if (Platform.OS !== 'web') return;
    // Create a hidden file input if not already created
    let input = fileInputRef.current as HTMLInputElement | null;
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      fileInputRef.current = input as any;
    }
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage('The selected file is too large. Maximum allowed file size is 10 MB.');
        haptics.error();
        (e.target as HTMLInputElement).value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          setCustomMediaUri(dataUrl);
          haptics.light();
        }
      };
      reader.readAsDataURL(file);
      // Reset input so same file can be picked again
      (e.target as HTMLInputElement).value = '';
    };
    input.click();
  }

  async function handlePickImageNative() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please enable media library access in your settings to select photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setErrorMessage('The selected image is too large. Maximum allowed file size is 10 MB.');
          haptics.error();
          return;
        }
        setCustomMediaUri(asset.uri);
        haptics.light();
      }
    } catch {
      Alert.alert('Image Picker Error', 'Unable to load image.');
    }
  }

  function handlePickImage() {
    if (Platform.OS === 'web') {
      handlePickImageWeb();
    } else {
      handlePickImageNative();
    }
  }

  function handleAddPollOption() {
    if (pollOptions.length >= 4) return;
    setPollOptions([...pollOptions, '']);
  }

  function handleRemovePollOption(index: number) {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  }

  /**
   * One submit path for all three actions. A draft only needs a headline OR a body;
   * everything else keeps the original "content is required" gate.
   */
  async function handleSubmit(status: 'published' | 'draft' | 'scheduled') {
    setErrorMessage(null);

    if (status === 'draft') {
      if (!topic.trim() && !content.trim()) {
        setErrorMessage('Add a headline or some text before saving a draft.');
        haptics.error();
        return;
      }
    } else if (!content.trim()) {
      setErrorMessage('Please write something before posting.');
      haptics.error();
      return;
    }

    if (attachPoll && !pollQuestion.trim()) {
      setErrorMessage('Please enter your poll question or remove the poll.');
      haptics.error();
      return;
    }

    let scheduledAt: string | undefined;
    if (status === 'scheduled') {
      if (!scheduledDateObj) {
        setErrorMessage('Enter a date as YYYY-MM-DD and a time as HH:MM (24-hour), or tap one of the quick options.');
        haptics.error();
        return;
      }
      const when = scheduledDateObj.getTime();
      if (when < Date.now() + MIN_SCHEDULE_LEAD_MS) {
        setErrorMessage('Pick a time at least 5 minutes from now.');
        haptics.error();
        return;
      }
      if (when > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
        setErrorMessage('You can only schedule up to 90 days ahead.');
        haptics.error();
        return;
      }
      scheduledAt = scheduledDateObj.toISOString();
    }

    haptics.medium();

    setSubmitting(true);
    try {
      const hasPoll = attachPoll && !!pollQuestion.trim();
      await onPublish({
        title: topic.trim() || content.trim().slice(0, 80),
        content: content.trim(),
        category: channel,
        visibilityScope: visibility === 'Campus Only' ? 'student' : 'global',
        scopeVisibility: visibility === 'Campus Only' ? 'campus' : 'global',
        sponsored: false,
        isPinned: isAdmin && pinToTop,
        postFormat: 'Thread',
        imageUrl: customMediaUri ?? undefined,
        pollQuestion: hasPoll ? pollQuestion.trim() : undefined,
        pollOptions: hasPoll ? pollOptions.filter((o) => o.trim().length > 0) : undefined,
        pollDurationHours: hasPoll ? pollDurationHours : undefined,
        status,
        scheduledAt,
      });
      onClose();
      reset();
      if (status === 'draft') {
        Alert.alert('Draft saved', 'You can finish and publish it later from your profile.');
      } else if (status === 'scheduled' && scheduledDateObj) {
        Alert.alert('Post scheduled', `This will go live on ${describeDateTime(scheduledDateObj)}.`);
      }
    } catch (err: any) {
      haptics.error();
      const defaultMsg =
        status === 'draft'
          ? 'Could not save this draft. Please try again.'
          : status === 'scheduled'
          ? 'Could not schedule this post. Please try again.'
          : 'Could not publish this post. Please try again.';
      setErrorMessage(getFriendlyErrorMessage(err, defaultMsg));
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
          paddingHorizontal: isDesktop ? spacing.lg : 0,
          paddingBottom: isDesktop ? spacing.lg : Math.max(insets.bottom, 16),
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : '100%',
            maxWidth: isDesktop ? 600 : undefined,
            maxHeight: isDesktop ? '88%' : undefined,
            borderRadius: isDesktop ? 24 : 0,
            padding: isDesktop ? spacing.xl : 0,
            borderWidth: isDesktop ? 1 : 0,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flex: 1, width: '100%' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: isDesktop ? spacing.md : 20 }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  {isAdmin ? 'Admin Thread / Broadcast' : 'New Post'}
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Admin Broadcast Badge & Controls */}
            {isAdmin && (
              <View
                style={{
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.10)' : '#FEF2F2',
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginBottom: spacing.md,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.28)' : '#FCA5A5',
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="shield-checkmark" size={16} color="#EF4444" />
                    <AppText weight="bold" variant="caption" style={{ color: '#EF4444', letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 11 }}>
                      Official Admin Communication
                    </AppText>
                  </View>
                  <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill }}>
                    <AppText weight="bold" style={{ color: '#FFFFFF', fontSize: 9.5 }}>ROOT ADMIN</AppText>
                  </View>
                </View>
                <AppText variant="caption" tone="secondary" style={{ fontSize: 11, lineHeight: 15 }}>
                  Publishing as Root Administrator. Your thread will display a verified badge across student, staff, and alumni feeds.
                </AppText>
                <Pressable
                  onPress={() => {
                    haptics.light();
                    setPinToTop((p) => !p);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, alignSelf: 'flex-start' }}
                >
                  <Ionicons name={pinToTop ? 'checkbox' : 'square-outline'} size={18} color={colors.brandPrimary} />
                  <AppText variant="caption" weight="bold" tone={pinToTop ? 'brand' : 'secondary'} style={{ fontSize: 11.5 }}>
                    Pin to Top of Forum
                  </AppText>
                </Pressable>
              </View>
            )}

            {/* Optional Headline */}
            <AppTextField
              label="Headline (Optional)"
              value={topic}
              onChangeText={setTopic}
              placeholder="Give your post a catchy title..."
            />

            {/* Body Content — required */}
            <AppTextField
              label="What's on your mind?"
              value={content}
              onChangeText={setContent}
              placeholder="Ask a question, share an idea, or start a discussion..."
              multiline
              numberOfLines={5}
            />

            {/* Attached Image Preview */}
            {customMediaUri ? (
              <View style={{ marginBottom: spacing.md, position: 'relative' }}>
                <Image
                  source={{ uri: customMediaUri }}
                  style={{ width: '100%', height: 160, borderRadius: radius.md, backgroundColor: '#000' }}
                  contentFit="cover"
                />
                <Pressable accessibilityRole="button" accessibilityLabel="Close"
                  onPress={() => { setCustomMediaUri(null); haptics.light(); }}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    borderRadius: 14,
                    width: 28,
                    height: 28,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}

            {/* Action Row: Photo + Poll */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Pressable
                onPress={handlePickImage}
                accessibilityRole="button"
                accessibilityLabel="Attach a photo"
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 44,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: customMediaUri ? colors.brandPrimary : colors.border,
                  backgroundColor: customMediaUri ? colors.pastelPrimaryBg : colors.surface,
                }}
              >
                <Ionicons name="image-outline" size={17} color={colors.brandPrimary} />
                <AppText variant="bodySmall" weight="bold" style={{ flexShrink: 1 }}>
                  Photo
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => { haptics.light(); setAttachPoll((v) => !v); }}
                accessibilityRole="button"
                accessibilityLabel={attachPoll ? 'Remove poll' : 'Attach a poll'}
                accessibilityState={{ selected: attachPoll }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 44,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: attachPoll ? '#10B981' : colors.border,
                  backgroundColor: attachPoll ? 'rgba(16,185,129,0.08)' : colors.surface,
                }}
              >
                <Ionicons name="bar-chart-outline" size={17} color={attachPoll ? '#10B981' : colors.textSecondary} />
                <AppText variant="bodySmall" weight="bold" style={{ color: attachPoll ? '#10B981' : colors.textSecondary, flexShrink: 1 }}>
                  Poll
                </AppText>
              </Pressable>
            </View>

            {/* Poll Fields */}
            {attachPoll && (
              <SolidCard radius={14} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: '#10B981', padding: spacing.md }}>
                <AppTextField
                  label="Poll Question"
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="e.g. Which programming language for CSC301?"
                />
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 4, textTransform: 'uppercase' }}>
                  Options
                </AppText>
                {pollOptions.map((opt, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 }}>
                    <View style={{ flex: 1 }}>
                      <AppTextField
                        label=""
                        value={opt}
                        onChangeText={(val) => {
                          const updated = [...pollOptions];
                          updated[idx] = val;
                          setPollOptions(updated);
                        }}
                        placeholder={`Option ${idx + 1}`}
                      />
                    </View>
                    {pollOptions.length > 2 && (
                      <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={() => handleRemovePollOption(idx)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.critical} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pollOptions.length < 4 && (
                  <Pressable onPress={handleAddPollOption} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 44 }}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="bold" tone="brand">+ Add Option</AppText>
                  </Pressable>
                )}

                {/* Poll duration */}
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginTop: spacing.xs, marginBottom: 6, textTransform: 'uppercase' }}>
                  Poll closes after
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POLL_DURATIONS.map((d) => {
                    const selected = pollDurationHours === d.hours;
                    return (
                      <Pressable
                        key={d.hours}
                        onPress={() => { haptics.light(); setPollDurationHours(d.hours); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: selected ? '#10B981' : colors.border,
                          backgroundColor: selected ? 'rgba(16,185,129,0.12)' : colors.surface,
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={selected ? 'bold' : 'medium'}
                          style={{ color: selected ? '#10B981' : colors.textSecondary, flexShrink: 1 }}
                        >
                          {d.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <AppText variant="caption" tone="secondary" style={{ marginTop: 6, flexShrink: 1 }}>
                  Voting stops {POLL_DURATIONS.find((d) => d.hours === pollDurationHours)?.label ?? '24 hours'} after this post goes live.
                </AppText>
              </SolidCard>
            )}

            {/* Community / Sub-Forum Selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Post Into Community
              </AppText>
              <AppText variant="caption" tone="brand" weight="bold" style={{ fontSize: 11 }}>
                {communities.find((c) => c.category === channel)?.moderatorBadge}
              </AppText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4, marginBottom: spacing.md }}
              style={{ flexGrow: 0 }}
            >
              {communities.map((com) => {
                const selected = channel === com.category;
                return (
                  <Pressable
                    key={com.id}
                    onPress={() => { haptics.light(); setChannel(com.category); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: radius.pill,
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                      backgroundColor: selected ? colors.brandPrimary : colors.surface,
                    }}
                  >
                    <Ionicons name={com.icon} size={13} color={selected ? '#FFFFFF' : colors.brandPrimary} />
                    <AppText variant="caption" weight="bold" tone={selected ? 'inverse' : 'primary'}>
                      {com.slug}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Audience */}
            <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Audience
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              {(globalWorkspaceEnabled ? (['Campus Only', 'Global Reach'] as const) : (['Campus Only'] as const)).map((v) => {
                const selected = visibility === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => { haptics.light(); setVisibility(v); }}
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: selected ? colors.brandPrimary : colors.border,
                      backgroundColor: selected ? colors.pastelPrimaryBg : colors.surface,
                    }}
                  >
                    <AppText variant="caption" weight={selected ? 'bold' : 'medium'} tone={selected ? 'brand' : 'secondary'}>
                      {v === 'Campus Only' ? '🏫 My Campus' : '🌍 All Universities'}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {/* Schedule for later */}
            <Pressable
              onPress={() => {
                haptics.light();
                setShowSchedule((v) => {
                  const next = !v;
                  if (next && !scheduleDate && !scheduleTime) {
                    const d = presetTomorrowMorning();
                    setScheduleDate(toDateInput(d));
                    setScheduleTime(toTimeInput(d));
                  }
                  return next;
                });
                setErrorMessage(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: showSchedule }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: showSchedule ? colors.brandPrimary : colors.border,
                backgroundColor: showSchedule ? colors.pastelPrimaryBg : colors.surface,
                marginTop: spacing.xs,
              }}
            >
              <Ionicons name="time-outline" size={17} color={showSchedule ? colors.brandPrimary : colors.textSecondary} />
              <AppText variant="bodySmall" weight="bold" tone={showSchedule ? 'brand' : 'secondary'} style={{ flexShrink: 1 }}>
                Schedule for later
              </AppText>
            </Pressable>

            {showSchedule && (
              <SolidCard radius={14} style={{ marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6, textTransform: 'uppercase' }}>
                  Quick options
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
                  {[
                    { label: 'In 1 hour', make: presetInAnHour },
                    { label: 'Tonight 6pm', make: presetTonight },
                    { label: 'Tomorrow 9am', make: presetTomorrowMorning },
                  ].map((p) => (
                    <Pressable
                      key={p.label}
                      onPress={() => applySchedulePreset(p.make())}
                      accessibilityRole="button"
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                      }}
                    >
                      <AppText variant="caption" weight="semiBold" style={{ flexShrink: 1 }}>
                        {p.label}
                      </AppText>
                    </Pressable>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 130 }}>
                    <AppTextField
                      label="Date"
                      value={scheduleDate}
                      onChangeText={(v) => { setScheduleDate(v); setErrorMessage(null); }}
                      placeholder="YYYY-MM-DD"
                      autoCapitalize="none"
                      autoCorrect={false}
                      inputMode="numeric"
                    />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 110, minWidth: 100 }}>
                    <AppTextField
                      label="Time (24h)"
                      value={scheduleTime}
                      onChangeText={(v) => { setScheduleTime(v); setErrorMessage(null); }}
                      placeholder="HH:MM"
                      autoCapitalize="none"
                      autoCorrect={false}
                      inputMode="numeric"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons
                    name={scheduledDateObj && scheduleWithinRange ? 'calendar-outline' : 'alert-circle-outline'}
                    size={15}
                    color={scheduledDateObj && scheduleWithinRange ? colors.brandPrimary : colors.critical}
                    style={{ marginTop: 2 }}
                  />
                  <AppText
                    variant="caption"
                    weight="semiBold"
                    style={{ flex: 1, flexShrink: 1, color: scheduledDateObj && scheduleWithinRange ? colors.brandPrimary : colors.critical }}
                  >
                    {!scheduledDateObj
                      ? 'Enter a date as YYYY-MM-DD and a time as HH:MM, or tap a quick option above.'
                      : scheduleWithinRange
                      ? `Goes live ${describeDateTime(scheduledDateObj)} (your local time).`
                      : scheduledDateObj.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS
                      ? `${describeDateTime(scheduledDateObj)} is not at least 5 minutes from now.`
                      : `${describeDateTime(scheduledDateObj)} is more than 90 days away.`}
                  </AppText>
                </View>
                <AppText variant="caption" tone="secondary" style={{ marginTop: 4, flexShrink: 1 }}>
                  Must be at least 5 minutes from now and no more than 90 days ahead.
                </AppText>
              </SolidCard>
            )}
          </ScrollView>

          {/* Error message */}
          {errorMessage ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEE2E2',
                borderColor: colors.critical,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                marginHorizontal: spacing.lg,
                marginBottom: spacing.sm,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.critical} />
              <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, flex: 1 }}>
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          {/* Footer Buttons - Post is the primary action; draft/schedule are secondary.
              Stacked on phones so nothing clips at 375px. */}
          <View
            style={{
              gap: spacing.sm,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <AppButton
              label={submitting ? 'Posting...' : 'Post now'}
              icon="send"
              fullWidth
              onPress={() => handleSubmit('published')}
              disabled={submitting}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 120 }}>
                <AppButton
                  label="Save draft"
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onPress={() => handleSubmit('draft')}
                  disabled={submitting}
                />
              </View>
              <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 120 }}>
                <AppButton
                  label={showSchedule ? 'Schedule' : 'Schedule...'}
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onPress={() => {
                    if (!showSchedule) {
                      setShowSchedule(true);
                      if (!scheduleDate && !scheduleTime) {
                        const d = presetTomorrowMorning();
                        setScheduleDate(toDateInput(d));
                        setScheduleTime(toTimeInput(d));
                      }
                      setErrorMessage('Pick when this should go live, then tap Schedule again.');
                      return;
                    }
                    handleSubmit('scheduled');
                  }}
                  disabled={submitting}
                />
              </View>
            </View>
            <AppButton label="Cancel" variant="ghost" fullWidth onPress={onClose} disabled={submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
