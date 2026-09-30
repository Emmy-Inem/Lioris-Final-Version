import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { Post } from '@/api/types';
import { updatePost, notifyPostMentions } from '@/api/posts';
import { haptics } from '@/utils/haptics';
import { getFriendlyErrorMessage } from '@/utils/errors';

interface EditPostModalProps {
  visible: boolean;
  post: Post;
  onClose: () => void;
  onSaved: (updated: Post) => void;
}

/** Title + body edit for a post's own author. Mirrors PublishThreadModal's fields, trimmed down to just what an edit needs. */
export function EditPostModal({ visible, post, onClose, onSaved }: EditPostModalProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The modal instance is shared across posts, so re-seed the fields every time it is (re)opened.
  React.useEffect(() => {
    if (visible) {
      setTitle(post.title);
      setContent(post.content);
      setErrorMessage(null);
    }
  }, [visible, post.id]);

  async function handleSave() {
    if (!content.trim()) {
      setErrorMessage('Please write something before saving.');
      haptics.error();
      return;
    }

    haptics.medium();
    setSaving(true);
    try {
      const trimmedContent = content.trim();
      const trimmedTitle = title.trim() || trimmedContent.slice(0, 80);
      const updated = await updatePost(post.id, { title: trimmedTitle, content: trimmedContent });

      // Best-effort, never blocks the edit from being reported as saved.
      void notifyPostMentions({
        postId: post.id,
        content: trimmedContent,
        campusCode: post.institutionCode,
        authorId: post.authorId,
        authorName: post.authorName,
      });

      onSaved(updated);
    } catch (err: any) {
      haptics.error();
      setErrorMessage(getFriendlyErrorMessage(err, 'Could not save your changes. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
        <SolidCard style={{ width: '100%', maxWidth: 420 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="create-outline" size={20} color={colors.brandPrimary} />
              <AppText variant="h3" weight="bold">
                Edit Post
              </AppText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} disabled={saving}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <AppTextField
            label="Headline"
            placeholder="Give your post a title..."
            value={title}
            onChangeText={setTitle}
          />
          <AppTextField
            label="Content"
            placeholder="What's on your mind?"
            value={content}
            onChangeText={setContent}
            multiline
            numberOfLines={5}
          />

          {errorMessage ? (
            <AppText variant="bodySmall" weight="semiBold" style={{ color: colors.critical, marginBottom: spacing.sm }}>
              {errorMessage}
            </AppText>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.xs }}>
            <AppButton label="Cancel" variant="ghost" onPress={onClose} disabled={saving} />
            <AppButton label={saving ? 'Saving...' : 'Save Changes'} variant="accent" onPress={handleSave} disabled={saving} />
          </View>
        </SolidCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}
