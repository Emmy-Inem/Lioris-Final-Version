import React, { useState } from'react';
import { Modal, Pressable, ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { haptics } from'@/utils/haptics';

interface CreateStudyGroupModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (payload: { name: string; courseCode: string; description: string; isPublic: boolean }) => void;
}

export function CreateStudyGroupModal({ visible, onClose, onCreate }: CreateStudyGroupModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [name, setName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setCourseCode('');
    setDescription('');
    setIsPublic(true);
  }

  async function handleCreate() {
    haptics.medium();
    setSubmitting(true);
    try {
      onCreate({ name: name.trim(), courseCode: courseCode.trim(), description: description.trim() || 'No description provided.', isPublic });
      onClose();
      reset();
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim().length > 0 && courseCode.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: spacing.lg }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
            <AppText variant="h1"weight="bold">
              New Study Group
            </AppText>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"accessibilityLabel="Close">
              <Ionicons name="close"size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          <AppTextField label="Group name"placeholder="e.g. CSC 301 Study Squad"value={name} onChangeText={setName} />
          <AppTextField label="Course code"placeholder="e.g. CSC 301"value={courseCode} onChangeText={setCourseCode} autoCapitalize="characters" />
          <AppTextField
            label="Description"placeholder="What's this group for? When do you usually meet?"value={description}
            onChangeText={setDescription}
            multiline
          />

          <Pressable
            onPress={() => setIsPublic((v) => !v)}
            accessibilityRole="checkbox"accessibilityState={{ checked: isPublic }}
            accessibilityLabel="Make this group public"style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl }}
          >
            <Ionicons name={isPublic ? 'checkbox' : 'square-outline'} size={22} color={isPublic ? colors.brandPrimary : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <AppText weight="semiBold"variant="bodySmall">
                Public group
              </AppText>
              <AppText tone="secondary"variant="caption">
                Anyone can find and join. Turn off to make it invite-only.
              </AppText>
            </View>
          </Pressable>

          <AppButton label="Create Group"onPress={handleCreate} loading={submitting} disabled={!canSubmit} fullWidth />
        </ScrollView>
      </View>
    </Modal>
  );
}
