import React, { useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { SolidCard } from './SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

const CHANNELS = ['Tech Hub', 'Academic', 'Polls', 'Housing', 'Social', 'Lost & Found'] as const;

const SUB_FORUM_COMMUNITIES = [
  { name: 'Tech Hub', slug: 'c/tech', icon: 'code-slash' as const, moderator: 'Tech Guild & GDSC Leads' },
  { name: 'Academic', slug: 'c/academic', icon: 'school' as const, moderator: 'Faculty Reps & TAs' },
  { name: 'Polls', slug: 'c/polls', icon: 'stats-chart' as const, moderator: 'Student Union SUG' },
  { name: 'Housing', slug: 'c/housing', icon: 'home' as const, moderator: 'Hall Wardens' },
  { name: 'Social', slug: 'c/social', icon: 'football' as const, moderator: 'Directorate of Socials' },
  { name: 'Lost & Found', slug: 'c/lost-found', icon: 'search' as const, moderator: 'Campus Marshal Desk' },
] as const;

const STUDENT_GIFS = [
  { label: 'Mind Blown 🤯', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { label: 'Aced It 🎉', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { label: 'Exam Mood 📚', url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { label: 'Need Coffee ☕', url: 'https://media.giphy.com/media/oZEBLugoTNRxS/giphy.gif' },
  { label: 'Coding Grind 💻', url: 'https://media.giphy.com/media/ule4akeXnY9A50XDUS/giphy.gif' },
  { label: 'Eureka! 💡', url: 'https://media.giphy.com/media/3ohzdQ1IynzclJldUQ/giphy.gif' },
  { label: 'Study Squad 🤝', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
];

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
    courseTags?: string;
    postFormat: 'Thread' | 'Rapid-Fire Conversation';
    imageUrl?: string;
    videoUrl?: string;
    pollQuestion?: string;
    pollOptions?: string[];
  }) => Promise<void>;
}

export function PublishThreadModal({ visible, onClose, onPublish }: PublishThreadModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('Academic');
  const [visibility, setVisibility] = useState<'Campus Only' | 'Global Reach'>('Campus Only');
  const [customMediaUri, setCustomMediaUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinToTop, setPinToTop] = useState(false);

  // Poll state
  const [attachPoll, setAttachPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Option A', 'Option B']);

  const [generatingAi, setGeneratingAi] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);

  function handleGenerateAiArt() {
    const seed = topic.trim() || content.trim() || channel;
    if (!seed) {
      Alert.alert('Topic Needed', 'Type a headline or what is on your mind first so the AI knows what to illustrate.');
      return;
    }
    haptics.medium();
    setGeneratingAi(true);
    const cleanPrompt = encodeURIComponent(`${seed} university campus modern vibrant digital art`);
    const aiUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=800&height=450&nologo=true&seed=${Date.now()}`;
    setCustomMediaUri(aiUrl);
    setTimeout(() => {
      setGeneratingAi(false);
      haptics.light();
    }, 400);
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
    setGeneratingAi(false);
    setShowGifPicker(false);
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
        setCustomMediaUri(result.assets[0].uri);
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

  async function handlePublish() {
    setErrorMessage(null);
    if (!content.trim()) {
      setErrorMessage('Please write something before posting.');
      haptics.error();
      return;
    }
    if (attachPoll && !pollQuestion.trim()) {
      setErrorMessage('Please enter your poll question or remove the poll.');
      haptics.error();
      return;
    }
    haptics.medium();

    setSubmitting(true);
    try {
      await onPublish({
        title: topic.trim() || content.trim().slice(0, 80),
        content: content.trim(),
        category: channel,
        visibilityScope: visibility === 'Campus Only' ? 'student' : 'global',
        scopeVisibility: visibility === 'Campus Only' ? 'campus' : 'global',
        sponsored: isAdmin && pinToTop ? true : false,
        postFormat: 'Thread',
        imageUrl: customMediaUri ?? undefined,
        pollQuestion: attachPoll && pollQuestion.trim() ? pollQuestion.trim() : undefined,
        pollOptions: attachPoll && pollQuestion.trim() ? pollOptions.filter((o) => o.trim().length > 0) : undefined,
      });
      onClose();
      reset();
    } catch (err: any) {
      haptics.error();
      setErrorMessage(err?.message || 'Could not publish this post. Please try again.');
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
          paddingTop: isDesktop ? spacing.lg : 52,
          paddingHorizontal: isDesktop ? spacing.lg : 0,
          paddingBottom: isDesktop ? spacing.lg : 0,
        }}
      >
        <View
          style={{
            flex: isDesktop ? undefined : 1,
            backgroundColor: colors.background,
            width: isDesktop ? '100%' : undefined,
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
                  {isAdmin ? 'Admin Campus Thread / Broadcast' : 'New Post'}
                </AppText>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
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
                  Publishing as University Platform Administrator. Your thread will display a verified badge across student, staff, and alumni feeds.
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
                    📌 Pin to Top of Campus Forum
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
                <Pressable
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

            {/* Action Row: Photo + AI Art + GIFs + Poll */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
              <Pressable
                onPress={handlePickImage}
                style={{
                  flex: 1,
                  minWidth: '22%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: customMediaUri && !customMediaUri.includes('pollinations') && !customMediaUri.includes('giphy') ? colors.brandPrimary : colors.border,
                  backgroundColor: customMediaUri && !customMediaUri.includes('pollinations') && !customMediaUri.includes('giphy') ? colors.pastelPrimaryBg : colors.surface,
                }}
              >
                <Ionicons name="image-outline" size={16} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" numberOfLines={1}>
                  Photo
                </AppText>
              </Pressable>

              <Pressable
                onPress={handleGenerateAiArt}
                disabled={generatingAi}
                style={{
                  flex: 1,
                  minWidth: '22%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: customMediaUri?.includes('pollinations') ? '#8B5CF6' : colors.border,
                  backgroundColor: customMediaUri?.includes('pollinations') ? 'rgba(139,92,246,0.12)' : colors.surface,
                }}
              >
                <Ionicons name="sparkles" size={15} color="#8B5CF6" />
                <AppText variant="caption" weight="bold" style={{ color: '#8B5CF6' }} numberOfLines={1}>
                  {generatingAi ? 'Generating...' : 'AI Art ✨'}
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => { haptics.light(); setShowGifPicker((v) => !v); }}
                style={{
                  flex: 1,
                  minWidth: '22%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: showGifPicker || customMediaUri?.includes('giphy') ? '#EC4899' : colors.border,
                  backgroundColor: showGifPicker || customMediaUri?.includes('giphy') ? 'rgba(236,72,153,0.12)' : colors.surface,
                }}
              >
                <Ionicons name="happy-outline" size={16} color="#EC4899" />
                <AppText variant="caption" weight="bold" style={{ color: '#EC4899' }} numberOfLines={1}>
                  GIFs
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => { haptics.light(); setAttachPoll((v) => !v); }}
                style={{
                  flex: 1,
                  minWidth: '22%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 9,
                  paddingHorizontal: 8,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: attachPoll ? '#10B981' : colors.border,
                  backgroundColor: attachPoll ? 'rgba(16,185,129,0.08)' : colors.surface,
                }}
              >
                <Ionicons name="bar-chart-outline" size={16} color={attachPoll ? '#10B981' : colors.textSecondary} />
                <AppText variant="caption" weight="bold" style={{ color: attachPoll ? '#10B981' : colors.textSecondary }} numberOfLines={1}>
                  Poll
                </AppText>
              </Pressable>
            </View>

            {/* Reaction GIFs Picker */}
            {showGifPicker && (
              <View style={{ marginBottom: spacing.md, backgroundColor: colors.surface, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 6 }}>
                  TAP A REACTION GIF TO ATTACH:
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {STUDENT_GIFS.map((gif) => (
                    <Pressable
                      key={gif.label}
                      onPress={() => {
                        haptics.medium();
                        setCustomMediaUri(gif.url);
                        setShowGifPicker(false);
                      }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: customMediaUri === gif.url ? colors.pastelPrimaryBg : colors.background,
                        borderWidth: 1,
                        borderColor: customMediaUri === gif.url ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText variant="caption" weight="semiBold">
                        {gif.label}
                      </AppText>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

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
                      <Pressable onPress={() => handleRemovePollOption(idx)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.critical} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pollOptions.length < 4 && (
                  <Pressable onPress={handleAddPollOption} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="add-circle-outline" size={16} color={colors.brandPrimary} />
                    <AppText variant="caption" weight="bold" tone="brand">+ Add Option</AppText>
                  </Pressable>
                )}
              </SolidCard>
            )}

            {/* Community / Sub-Forum Selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <AppText variant="caption" weight="bold" tone="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Post Into Community
              </AppText>
              <AppText variant="caption" tone="brand" weight="bold" style={{ fontSize: 11 }}>
                🛡️ {SUB_FORUM_COMMUNITIES.find((c) => c.name === channel)?.moderator}
              </AppText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4, marginBottom: spacing.md }}
              style={{ flexGrow: 0 }}
            >
              {SUB_FORUM_COMMUNITIES.map((com) => {
                const selected = channel === com.name;
                return (
                  <Pressable
                    key={com.name}
                    onPress={() => { haptics.light(); setChannel(com.name); }}
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
              {(['Campus Only', 'Global Reach'] as const).map((v) => {
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

          {/* Footer Buttons */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              justifyContent: 'flex-end',
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <AppButton label="Cancel" variant="ghost" onPress={onClose} disabled={submitting} />
            <AppButton
              label={submitting ? 'Posting...' : 'Post'}
              onPress={handlePublish}
              disabled={submitting}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
