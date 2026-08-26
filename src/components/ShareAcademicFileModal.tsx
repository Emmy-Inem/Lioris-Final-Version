import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as DocumentPicker from 'expo-document-picker';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';

const CATEGORIES = ['Notes', 'Past Questions', 'Projects'] as const;

export interface UploadAcademicPayload {
  title: string;
  courseCode: string;
  description: string;
  category: (typeof CATEGORIES)[number];
  fileBlob?: Blob;
  fileSize?: string;
  fileSizeBytes?: number;
  fileMimeType?: string;
  fileType?: 'PDF' | 'ZIP' | 'EPUB' | 'DOC' | 'PPT' | 'XLS' | 'TXT' | 'IMG';
}

interface ShareAcademicFileModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: (payload: UploadAcademicPayload) => Promise<void> | void;
}

export function ShareAcademicFileModal({ visible, onClose, onUpload }: ShareAcademicFileModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Notes');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size?: number;
    mimeType?: string;
    file?: Blob;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const translateY = useSharedValue(80);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 260 });
      backdropOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
      setErrorMessage(null);
    } else {
      translateY.value = 80;
      backdropOpacity.value = 0;
    }
  }, [visible, translateY, backdropOpacity]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/zip',
          'application/x-zip-compressed',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'image/*',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let fileBlob: Blob | undefined = asset.file;
        if (!fileBlob && asset.uri) {
          try {
            const response = await fetch(asset.uri);
            fileBlob = await response.blob();
          } catch {
            // fallback
          }
        }
        setSelectedFile({
          name: asset.name,
          size: asset.size || fileBlob?.size,
          mimeType: asset.mimeType || fileBlob?.type,
          file: fileBlob,
        });
        if (errorMessage) setErrorMessage(null);
      }
    } catch {
      Alert.alert('File Picker Error', 'Unable to access document.');
    }
  }

  async function handleUpload() {
    setErrorMessage(null);
    if (!title.trim()) {
      setErrorMessage('Please enter a descriptive resource title.');
      return;
    }
    if (!courseCode.trim()) {
      setErrorMessage('Please enter the target course code (e.g. CSC 301).');
      return;
    }

    setIsUploading(true);

    const realBytes = selectedFile?.size || selectedFile?.file?.size || 1024 * 1024;
    const sizeFormatted = realBytes > 1024 * 1024
      ? `${(realBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(realBytes / 1024)} KB`;

    const fileNameLower = (selectedFile?.name || '').toLowerCase();
    let fileType: 'PDF' | 'ZIP' | 'EPUB' | 'DOC' | 'PPT' | 'XLS' | 'TXT' | 'IMG' = 'PDF';
    if (fileNameLower.endsWith('.zip') || fileNameLower.endsWith('.rar')) fileType = 'ZIP';
    else if (fileNameLower.endsWith('.doc') || fileNameLower.endsWith('.docx')) fileType = 'DOC';
    else if (fileNameLower.endsWith('.ppt') || fileNameLower.endsWith('.pptx')) fileType = 'PPT';
    else if (fileNameLower.endsWith('.xls') || fileNameLower.endsWith('.xlsx')) fileType = 'XLS';
    else if (fileNameLower.endsWith('.txt')) fileType = 'TXT';
    else if (fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) fileType = 'IMG';

    try {
      await onUpload({
        title: title.trim(),
        courseCode: courseCode.trim().toUpperCase(),
        description: description.trim(),
        category,
        fileBlob: selectedFile?.file,
        fileSize: sizeFormatted,
        fileSizeBytes: realBytes,
        fileMimeType: selectedFile?.mimeType,
        fileType,
      });
      setTitle('');
      setCourseCode('');
      setDescription('');
      setSelectedFile(null);
      setErrorMessage(null);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to upload resource. Please check and try again.');
    } finally {
      setIsUploading(false);
    }
  }

  const { isDesktop } = useResponsive();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: isDesktop ? 'center' : 'stretch', padding: isDesktop ? spacing.lg : 0 }}>
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
            backdropStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              backgroundColor: colors.background,
              borderRadius: isDesktop ? 24 : 0,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: spacing.lg,
              maxHeight: '90%',
              maxWidth: isDesktop ? 580 : undefined,
              width: isDesktop ? '100%' : undefined,
            },
            sheetStyle,
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="cloud-upload" size={20} color={colors.brandPrimary} />
            <AppText variant="h2" weight="bold">
              Share Academic File
            </AppText>
          </View>
          <AppText tone="secondary" style={{ marginBottom: spacing.md }}>
            Upload reference notes, past exams, or group projects to help your classmates learn.
          </AppText>

          <AppTextField label="" placeholder="Resource Title / Subject" value={title} onChangeText={setTitle} />
          <AppTextField label="" placeholder="Course Code (e.g. CSC 301)" value={courseCode} onChangeText={setCourseCode} />
          <AppTextField label="" placeholder="Short Description" value={description} onChangeText={setDescription} multiline />

          {/* Document Attachment Picker Button */}
          <Pressable
            onPress={handlePickFile}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: spacing.md,
              borderRadius: radius.md,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: selectedFile ? colors.brandPrimary : colors.border,
              backgroundColor: selectedFile ? colors.pastelPrimaryBg : colors.surface,
              marginBottom: spacing.md,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              <Ionicons
                name={selectedFile ? 'document-text' : 'attach-outline'}
                size={20}
                color={selectedFile ? colors.brandPrimary : colors.textSecondary}
              />
              <View style={{ flex: 1 }}>
                <AppText weight="semiBold" variant="bodySmall" numberOfLines={1}>
                  {selectedFile ? selectedFile.name : 'Attach Document (PDF, ZIP)'}
                </AppText>
                {selectedFile?.size ? (
                  <AppText variant="caption" tone="secondary">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </AppText>
                ) : null}
              </View>
            </View>
            <AppText variant="caption" weight="bold" tone="brand">
              {selectedFile ? 'Change' : 'Browse'}
            </AppText>
          </Pressable>

          <AppText weight="bold" variant="bodySmall" style={{ marginBottom: spacing.sm }}>
            Resource Category:
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
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
                  <AppText variant="bodySmall" weight="semiBold" tone={selected ? 'brand' : 'secondary'}>
                    {cat}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

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
                marginBottom: spacing.md,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.critical} />
              <AppText
                variant="bodySmall"
                weight="semiBold"
                style={{ color: colors.critical, flex: 1 }}
              >
                {errorMessage}
              </AppText>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <AppButton label="Cancel" variant="ghost" onPress={onClose} disabled={isUploading} />
            <AppButton
              label={isUploading ? 'Uploading...' : 'Upload File'}
              onPress={handleUpload}
              loading={isUploading}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
