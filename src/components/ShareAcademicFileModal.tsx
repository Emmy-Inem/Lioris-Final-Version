import React, { useEffect, useState } from'react';
import { Modal, Pressable, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';

const CATEGORIES = ['Notes', 'Past Questions', 'Projects'] as const;

interface ShareAcademicFileModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: (payload: { title: string; courseCode: string; description: string; category: (typeof CATEGORIES)[number] }) => void;
}

// PRD Section 8 — real slide-up + spring entrance and a fading backdrop
// for this bottom sheet, instead of popping in instantly under RN
// Modal's native fade.
export function ShareAcademicFileModal({ visible, onClose, onUpload }: ShareAcademicFileModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Notes');
  const translateY = useSharedValue(80);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 260 });
      backdropOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
    } else {
      translateY.value = 80;
      backdropOpacity.value = 0;
    }
  }, [visible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const canUpload = title.trim().length > 0 && courseCode.trim().length > 0;

  function handleUpload() {
    onUpload({ title, courseCode, description, category });
    onClose();
    setTitle('');
    setCourseCode('');
    setDescription('');
  }

  return (
    <Modal visible={visible} transparent animationType="none"onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
            backdropStyle,
          ]}
        />
        <Animated.View style={[{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg }, sheetStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="cloud-upload"size={20} color={colors.brandPrimary} />
            <AppText variant="h2"weight="bold">
              Share Academic File
            </AppText>
          </View>
          <AppText tone="secondary"style={{ marginBottom: spacing.lg }}>
            Upload reference notes, past exams, or group projects to help your classmates learn.
          </AppText>

          <AppTextField label=""placeholder="Resource Title / Subject"value={title} onChangeText={setTitle} />
          <AppTextField label=""placeholder="Course Code"value={courseCode} onChangeText={setCourseCode} />
          <AppTextField label=""placeholder="Short Description"value={description} onChangeText={setDescription} multiline />

          <AppText weight="bold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
            Resource Category:
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"accessibilityState={{ checked: selected }}
                  accessibilityLabel={cat}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
                    borderWidth: selected ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText variant="bodySmall"weight="semiBold"tone={selected ? 'brand' : 'secondary'}>
                    {cat}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Cancel"variant="ghost"onPress={onClose} />
            <AppButton label="Upload File"onPress={handleUpload} disabled={!canUpload} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
