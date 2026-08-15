import React, { useState } from'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from'react-native';
import { Image } from'expo-image';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { Badge } from'./Badge';
import { SolidCard } from'./SolidCard';
import { useTheme } from'@/theme/ThemeProvider';
import { haptics } from'@/utils/haptics';

const CHANNELS = ['Tech Hub', 'Academic', 'Polls', 'Housing', 'Social', 'Lost & Found'] as const;

const ATTACHABLE_MEDIA = [
  { id: 'event_tech_hackathon', label: 'Tech Demo / Hackathon', type: 'image', src: require('../../assets/images/event_tech_hackathon.jpg') },
  { id: 'campus_students_photo', label: 'Campus Quad', type: 'image', src: require('../../assets/images/campus_students_photo.jpg') },
  { id: 'campus_library_study', label: 'Study Circle', type: 'image', src: require('../../assets/images/campus_library_study.jpg') },
  { id: 'student_rep_group', label: 'Student Senate 🤝', type: 'image', src: require('../../assets/images/student_rep_group.jpg') },
  { id: 'event_academic_symposium', label: 'Symposium Keynote', type: 'image', src: require('../../assets/images/event_academic_symposium.jpg') },
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
  }) => void;
}

export function PublishThreadModal({ visible, onClose, onPublish }: PublishThreadModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [mode, setMode] = useState<'Thread' | 'Rapid-Fire Conversation'>('Thread');
  const [topic, setTopic] = useState('');
  const [courseTags, setCourseTags] = useState('');
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('Tech Hub');
  const [visibility, setVisibility] = useState<'Campus Only' | 'Global Reach'>('Campus Only');
  const [sponsored, setSponsored] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [isVideoAttachment, setIsVideoAttachment] = useState(false);

  // Poll state
  const [attachPoll, setAttachPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['Option A', 'Option B']);

  function reset() {
    setTopic('');
    setCourseTags('');
    setContent('');
    setSelectedMediaId(null);
    setIsVideoAttachment(false);
    setAttachPoll(false);
    setPollQuestion('');
    setPollOptions(['Option A', 'Option B']);
    setSponsored(false);
    setMode('Thread');
  }

  function handleAddPollOption() {
    if (pollOptions.length >= 4) return;
    setPollOptions([...pollOptions, `Option ${String.fromCharCode(65 + pollOptions.length)}`]);
  }

  function handleRemovePollOption(index: number) {
    if (pollOptions.length <= 2) return;
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  }

  function handlePublish() {
    if (!topic.trim() || !content.trim()) return;
    haptics.medium();
    onPublish({
      title: topic.trim(),
      content: content.trim(),
      category: channel,
      visibilityScope: visibility === 'Campus Only' ? 'student' : 'global',
      scopeVisibility: visibility === 'Campus Only' ? 'campus' : 'global',
      sponsored,
      courseTags: courseTags.trim() || undefined,
      postFormat: mode,
      imageUrl: selectedMediaId || undefined,
      videoUrl: isVideoAttachment ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' : undefined,
      pollQuestion: attachPoll && pollQuestion.trim() ? pollQuestion.trim() : undefined,
      pollOptions: attachPoll && pollQuestion.trim() ? pollOptions.filter((o) => o.trim().length > 0) : undefined,
    });
    onClose();
    reset();
  }

  return (
    <Modal visible={visible} animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 52, paddingHorizontal: spacing.lg }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="create-outline"size={22} color={colors.brandPrimary} />
              <AppText variant="h2"weight="bold">
                Create Campus Thread 
              </AppText>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close"size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <AppText tone="secondary"style={{ marginBottom: spacing.md }}>
            Start a discussion, share academic insights, attach demo videos or launch live polls.
          </AppText>

          {/* Mode Switcher */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.md }}>
            {(['Thread', 'Rapid-Fire Conversation'] as const).map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    haptics.light();
                    setMode(m);
                  }}
                  accessibilityRole="tab"accessibilityState={{ selected }}
                  accessibilityLabel={m}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    backgroundColor: selected ? colors.surface : 'transparent',
                  }}
                >
                  <AppText variant="bodySmall"weight={selected ? 'bold' : 'regular'} tone={selected ? 'primary' : 'secondary'}>
                    {m === 'Thread' ? 'Structured Thread' : 'Rapid-Fire Post'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppTextField label="Headline / Thread Topic"value={topic} onChangeText={setTopic} placeholder="e.g. CSC 301 Study Circle or Aqua AI Demo" />
          <AppTextField
            label="Course Tags (Optional)"value={courseTags}
            onChangeText={setCourseTags}
            placeholder="e.g. CSC 301, MTH 101, Algorithms"
          />
          <AppTextField
            label="Body Content"value={content}
            onChangeText={setContent}
            placeholder="Share your thoughts, ask questions, or provide project notes..."multiline
            numberOfLines={4}
          />

          {/* Media Attachments Hub */}
          <View style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1 }}>
                ATTACH MEDIA (PHOTO / VIDEO) 📸
              </AppText>
              <Pressable
                onPress={() => {
                  haptics.light();
                  setIsVideoAttachment((v) => !v);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Ionicons name={isVideoAttachment ? 'videocam' : 'videocam-outline'} size={15} color={isVideoAttachment ? colors.brandPrimary : colors.textSecondary} />
                <AppText variant="caption"weight="bold"tone={isVideoAttachment ? 'brand' : 'secondary'}>
                  {isVideoAttachment ? 'Video Mode Active' : 'Enable Video Badge'}
                </AppText>
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {ATTACHABLE_MEDIA.map((preset) => {
                const isSelected = selectedMediaId === preset.id;
                return (
                  <Pressable
                    key={preset.id}
                    onPress={() => {
                      haptics.light();
                      setSelectedMediaId(isSelected ? null : preset.id);
                    }}
                    style={{
                      width: 120,
                      height: 80,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                      position: 'relative',
                    }}
                  >
                    <Image source={preset.src} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    {isSelected ? (
                      <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.brandPrimary, borderRadius: 10, padding: 2 }}>
                        <Ionicons name="checkmark"size={14} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Poll Attachment Hub */}
          <SolidCard radius={16} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: attachPoll ? colors.brandPrimary : colors.border }}>
            <Pressable
              onPress={() => {
                haptics.light();
                setAttachPoll((v) => !v);
              }}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="bar-chart-outline"size={18} color={colors.brandPrimary} />
                <AppText weight="bold"variant="bodySmall">Attach Live Poll </AppText>
              </View>
              <Badge label={attachPoll ? 'Active' : 'Add Poll'} tone={attachPoll ? 'brand' : 'neutral'} />
            </Pressable>

            {attachPoll && (
              <View style={{ marginTop: spacing.sm }}>
                <AppTextField label="Poll Question"value={pollQuestion} onChangeText={setPollQuestion} placeholder="e.g. Which programming language for CSC301 project?" />

                <AppText variant="caption"weight="bold"tone="secondary"style={{ marginBottom: 4 }}>
                  POLL OPTIONS
                </AppText>

                {pollOptions.map((opt, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 }}>
                    <View style={{ flex: 1 }}>
                      <AppTextField
                        label=""value={opt}
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
                        <Ionicons name="trash-outline"size={18} color={colors.critical} />
                      </Pressable>
                    )}
                  </View>
                ))}

                {pollOptions.length < 4 && (
                  <Pressable onPress={handleAddPollOption} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="add-circle-outline"size={16} color={colors.brandPrimary} />
                    <AppText variant="caption"weight="bold"tone="brand">+ Add Option</AppText>
                  </Pressable>
                )}
              </View>
            )}
          </SolidCard>

          {/* Channel Selector */}
          <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
            TOPIC CHANNEL
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md }}>
            {CHANNELS.map((ch) => {
              const selected = channel === ch;
              return (
                <Pressable
                  key={ch}
                  onPress={() => {
                    haptics.light();
                    setChannel(ch);
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 7,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? colors.brandPrimary : colors.border,
                    backgroundColor: selected ? colors.brandPrimary : colors.surface,
                  }}
                >
                  <AppText variant="caption"weight="bold"tone={selected ? 'inverse' : 'secondary'}>
                    {ch}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Audience Reach */}
          <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
            AUDIENCE REACH
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            {(['Campus Only', 'Global Reach'] as const).map((v) => {
              const selected = visibility === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => {
                    haptics.light();
                    setVisibility(v);
                  }}
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
                  <AppText variant="bodySmall"weight={selected ? 'bold' : 'medium'} tone={selected ? 'brand' : 'secondary'}>
                    {v === 'Campus Only' ? 'My Campus Only' : '🌍 Global University Network'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Sponsor Toggle */}
          <Pressable
            onPress={() => {
              haptics.light();
              setSponsored((v) => !v);
            }}
            accessibilityRole="checkbox"accessibilityState={{ checked: sponsored }}
            accessibilityLabel="Sponsor this post"style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}
          >
            <Ionicons
              name={sponsored ? 'checkbox' : 'square-outline'}
              size={20}
              color={sponsored ? colors.brandPrimary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <AppText weight="semiBold"tone="brand">
                Sponsor this Thread 
              </AppText>
              <AppText tone="secondary"variant="caption">
                Pin and highlight this discussion at the top of your campus feed.
              </AppText>
            </View>
          </Pressable>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
          <AppButton label="Cancel"variant="ghost"onPress={onClose} />
          <AppButton
            label="Publish Thread"onPress={handlePublish}
            disabled={!topic.trim() || !content.trim()}
          />
        </View>
      </View>
    </Modal>
  );
}
