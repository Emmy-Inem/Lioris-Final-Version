import React, { useEffect, useState } from'react';
import { Modal, Pressable, View } from'react-native';
import { Image } from'expo-image';
import * as ImagePicker from'expo-image-picker';
import { Ionicons } from'@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from'react-native-reanimated';
import { AppText } from'./AppText';
import { AppTextField } from'./AppTextField';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { haptics } from'@/utils/haptics';

const DOCUMENT_TYPES = ['Student ID', 'Admission Letter', 'Staff ID', 'Alumni Certificate'] as const;

interface ApplyForVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    institutionClaimed: string;
    documentType: (typeof DOCUMENT_TYPES)[number];
    documentReference: string;
    documentPhotoUri?: string | null;
  }) => void;
}

/**
 * Backs the Profile screen's"Apply for Verification"banner for
 * accounts that didn't auto-verify at registration. PRD Section 8 —
 * real scale+fade entrance for the dialog (same treatment as
 * AdminConfigModal / DiscussionWorkspacesModal).
 */
export function ApplyForVerificationModal({ visible, onClose, onSubmit }: ApplyForVerificationModalProps) {
  const { colors, spacing, radius } = useTheme();
  const [institutionClaimed, setInstitutionClaimed] = useState('');
  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPES)[number]>('Student ID');
  const [documentReference, setDocumentReference] = useState('');
  const [documentPhotoUri, setDocumentPhotoUri] = useState<string | null>(null);
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

  async function pickDocumentPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setDocumentPhotoUri(result.assets[0].uri);
  }

  const canSubmit = institutionClaimed.trim().length > 0 && documentReference.trim().length > 0;

  function handleSubmit() {
    haptics.success();
    onSubmit({
      institutionClaimed: institutionClaimed.trim(),
      documentType,
      documentReference: documentReference.trim(),
      documentPhotoUri,
    });
    onClose();
    setDocumentPhotoUri(null);
    setInstitutionClaimed('');
    setDocumentReference('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
        <Animated.View style={[{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: '100%' }, animatedStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="shield-checkmark"size={20} color={colors.brandPrimary} />
            <AppText variant="h3"weight="bold">
              Apply for Verification
            </AppText>
          </View>
          <AppText tone="secondary"variant="bodySmall"style={{ marginBottom: spacing.lg }}>
            Submit your school and a supporting document reference. A reviewer approves or
            rejects this manually — it isn't granted automatically.
          </AppText>

          <AppTextField label="Your school"value={institutionClaimed} onChangeText={setInstitutionClaimed} placeholder="e.g. Obafemi Awolowo University" />

          <AppText weight="semiBold"variant="bodySmall"style={{ marginBottom: spacing.sm }}>
            Document type
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {DOCUMENT_TYPES.map((type) => {
              const selected = documentType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setDocumentType(type)}
                  accessibilityRole="radio"accessibilityState={{ checked: selected }}
                  accessibilityLabel={type}
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
                    {type}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <AppTextField
            label="Document reference / ID number"value={documentReference}
            onChangeText={setDocumentReference}
            placeholder="e.g. Matric No. OAU/2021/04521"
          />

          <Pressable
            onPress={pickDocumentPhoto}
            accessibilityRole="button"accessibilityLabel={documentPhotoUri ? 'Change uploaded document photo' : 'Upload supporting document'}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: documentPhotoUri ? 'solid' : 'dashed',
              borderRadius: radius.md,
              alignItems: 'center',
              paddingVertical: documentPhotoUri ? 0 : spacing.lg,
              marginBottom: spacing.lg,
              overflow: 'hidden',
            }}
          >
            {documentPhotoUri ? (
              <Image source={{ uri: documentPhotoUri }} style={{ width: '100%', height: 120 }} contentFit="cover"transition={200} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline"size={20} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
                <AppText tone="secondary"variant="bodySmall">
                  Upload supporting document (photo)
                </AppText>
              </>
            )}
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Cancel"variant="ghost"onPress={onClose} />
            <AppButton label="Submit for review"onPress={handleSubmit} disabled={!canSubmit} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
