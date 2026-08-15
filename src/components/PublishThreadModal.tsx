import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

const CHANNELS = ['Tech Hub', 'Housing', 'Social', 'Lost & Found'] as const;

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
  }) => void;
}

export function PublishThreadModal({ visible, onClose, onPublish }: PublishThreadModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [mode, setMode] = useState<'Thread' | 'Rapid-Fire Conversation'>('Thread');
  const [topic, setTopic] = useState('');
  const [courseTags, setCourseTags] = useState('');
  const [content, setContent] = useState('');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('Tech Hub');
  const [visibility, setVisibility] = useState<'Campus Only' | 'Global Reach'>('Campus Only');
  const [sponsored, setSponsored] = useState(false);

  function reset() {
    setTopic('');
    setCourseTags('');
    setContent('');
    setSponsored(false);
    setMode('Thread');
  }

  function handlePublish() {
    haptics.medium();
    onPublish({
      title: topic,
      content,
      category: channel,
      visibilityScope: visibility === 'Campus Only' ? 'student' : 'global',
      scopeVisibility: visibility === 'Campus Only' ? 'campus' : 'global',
      sponsored,
      courseTags: courseTags.trim() || undefined,
      postFormat: mode,
    });
    onClose();
    reset();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: spacing.lg }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="create" size={20} color={colors.brandPrimary} />
            <AppText variant="h2" weight="bold">
              Publish Campus Thread
            </AppText>
          </View>
          <AppText tone="secondary" style={{ marginBottom: spacing.lg }}>
            Share academic queries, student housing needs, or general chat with the campus
            community.
          </AppText>

          <View style={{ flexDirection: 'row', backgroundColor: colors.divider, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg }}>
            {(['Thread', 'Rapid-Fire Conversation'] as const).map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={m}
                  style={{
                    flex: 1,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    backgroundColor: selected ? colors.surface : 'transparent',
                  }}
                >
                  <AppText variant="bodySmall" weight={selected ? 'bold' : 'regular'}>
                    {m}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ marginBottom: 4 }}>
            <AppTextField label="Topic Heading" placeholder="" value={topic} onChangeText={setTopic} maxLength={100} />
          </View>
          <AppText tone="secondary" variant="caption" style={{ textAlign: 'right', marginTop: -spacing.sm, marginBottom: spacing.md }}>
            {topic.length} / 100
          </AppText>

          <AppTextField
            label=""
            placeholder="Course Tags (e.g. CSC 301, MTH 101)"
            value={courseTags}
            onChangeText={setCourseTags}
          />

          <AppTextField
            label="What is on your mind?"
            placeholder=""
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={5}
            maxLength={1000}
          />
          <AppText tone="secondary" variant="caption" style={{ textAlign: 'right', marginTop: -spacing.sm, marginBottom: spacing.md }}>
            {content.length} / 1000
          </AppText>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
            <AppText variant="caption" weight="bold" tone="secondary">
              Format Tools:
            </AppText>
            {(['bold', 'italic', 'link', 'list', 'list-numbered'] as const).map((tool) => (
              <FormatIcon key={tool} name={tool} />
            ))}
            <AppText variant="caption" tone="brand" weight="semiBold" style={{ marginLeft: 'auto' }}>
              Markdown
            </AppText>
          </View>

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Category Channel:
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CHANNELS.map((ch) => {
              const selected = channel === ch;
              return (
                <Pressable
                  key={ch}
                  onPress={() => setChannel(ch)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={ch}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                    {ch}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Visibility Scope:
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {(['Campus Only', 'Global Reach'] as const).map((v) => {
              const selected = visibility === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setVisibility(v)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={v}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                    {v === 'Campus Only' ? 'Campus Only 🏫' : 'Global Reach 🌐'}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setSponsored((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sponsored }}
            accessibilityLabel="Sponsor this post"
            style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}
          >
            <Ionicons
              name={sponsored ? 'checkbox' : 'square-outline'}
              size={20}
              color={sponsored ? colors.brandPrimary : colors.textSecondary}
            />
            <View style={{ flex: 1 }}>
              <AppText weight="semiBold" tone="brand">
                Sponsor this Post 🌟
              </AppText>
              <AppText tone="secondary" variant="caption">
                Run ads to boost this post's visibility across the network. Pending admin
                approval.
              </AppText>
            </View>
          </Pressable>

          <Pressable
            onPress={() =>
              Alert.alert(
                'Not available yet',
                'Scheduled posting isn\u2019t built in this preview \u2014 your post publishes immediately when you tap Publish.',
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Schedule post (not yet available)"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl }}
          >
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <AppText tone="secondary" weight="semiBold">
              Schedule Post
            </AppText>
          </Pressable>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', paddingVertical: spacing.md }}>
          <AppButton label="Cancel" variant="ghost" onPress={onClose} />
          <AppButton label="Publish" onPress={handlePublish} disabled={!topic.trim() || !content.trim()} />
        </View>
      </View>
    </Modal>
  );
}

function FormatIcon({ name }: { name: 'bold' | 'italic' | 'link' | 'list' | 'list-numbered' }) {
  const { colors } = useTheme();
  const iconMap: Record<typeof name, keyof typeof Ionicons.glyphMap> = {
    bold: 'text',
    italic: 'text',
    link: 'link',
    list: 'list',
    'list-numbered': 'reorder-four',
  };
  return (
    <View
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: colors.divider,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={iconMap[name]} size={13} color={colors.textSecondary} />
    </View>
  );
}
