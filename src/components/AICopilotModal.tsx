import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from '@/components/AppText';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import {
  askAiStudyCopilot,
  CopilotMode,
  CopilotResponse,
  MultimodalAttachment,
} from '@/api/aiCopilot';

interface AICopilotModalProps {
  visible: boolean;
  onClose: () => void;
  initialCourse?: string;
  initialPrompt?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  mode?: CopilotMode;
  source?: string;
  timestamp: string;
  imageUri?: string;
}

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: 'Hello! I am your Lioris AI study assistant powered by Google Gemini. Ask me to explain concepts, break down past questions, generate revision flashcards, or attach chalkboard math and diagrams.',
  source: 'Google Gemini 3.6 Flash',
  timestamp: 'Just now',
};

const QUICK_PROMPTS: { label: string; mode: CopilotMode; text: string; icon: any }[] = [
  { label: 'Explain Concept', mode: 'explain', text: 'Explain the principles of Object-Oriented Design simply', icon: 'bulb-outline' },
  { label: 'Solve Math / Diagram', mode: 'math_solve', text: 'Solve this chalkboard math / physics problem step-by-step with LaTeX equations', icon: 'calculator-outline' },
  { label: 'Past Question', mode: 'past_question', text: 'Break down a past question on Dijkstra Shortest Path', icon: 'help-circle-outline' },
  { label: 'Active Flashcards', mode: 'flashcards', text: 'Generate 4 active-recall study flashcards for quick revision', icon: 'albums-outline' },
  { label: 'Revision Quiz', mode: 'quiz', text: 'Generate 3 high-yield questions on Operating Systems memory paging', icon: 'school-outline' },
  { label: 'Study Schedule', mode: 'schedule', text: 'Create a 3-day exam timetable for engineering finals', icon: 'calendar-outline' },
];

/**
 * Elegant native text formatting component that renders structured headings,
 * callout quotes, bullet points, numbered steps, and LaTeX mathematical formula blocks.
 */
function FormattedAcademicContent({ text, isUser, colors }: { text: string; isUser: boolean; colors: any }) {
  if (isUser) {
    return (
      <AppText variant="bodySmall" tone="inverse" style={{ lineHeight: 20 }}>
        {text}
      </AppText>
    );
  }

  const lines = text.split('\n');

  function renderInline(line: string, keyPrefix: string) {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\\\([^\]]+\\\))/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <AppText key={keyPrefix + '-' + idx} weight="bold" variant="bodySmall" tone="primary">
            {part.slice(2, -2)}
          </AppText>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <View
            key={keyPrefix + '-' + idx}
            style={{
              backgroundColor: colors.border + '30',
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: 4,
              alignSelf: 'center',
            }}
          >
            <AppText
              variant="caption"
              weight="medium"
              style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.textPrimary }}
            >
              {part.slice(1, -1)}
            </AppText>
          </View>
        );
      }
      if (part.startsWith('\\(') && part.endsWith('\\)')) {
        return (
          <AppText
            key={keyPrefix + '-' + idx}
            weight="bold"
            variant="bodySmall"
            style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: colors.textPrimary }}
          >
            {part.slice(2, -2)}
          </AppText>
        );
      }
      return (
        <AppText key={keyPrefix + '-' + idx} variant="bodySmall" tone="primary">
          {part}
        </AppText>
      );
    });
  }

  return (
    <View style={{ gap: 4 }}>
      {lines.map((rawLine, lineIndex) => {
        const line = rawLine.trim();
        if (!line) return <View key={lineIndex} style={{ height: 4 }} />;

        // LaTeX Display Formula Block
        if (line.startsWith('\\\[') || line.endsWith('\\\]') || line.includes('\\boxed') || line.startsWith('$$')) {
          const formulaClean = line
            .replace(/\\\(/g, '')
            .replace(/\\\)/g, '')
            .replace(/\\\[/g, '')
            .replace(/\\\]/g, '')
            .replace(/\$\$/g, '')
            .trim();
          return (
            <View
              key={lineIndex}
              style={{
                backgroundColor: colors.divider,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                padding: 10,
                marginVertical: 4,
                alignItems: 'center',
              }}
            >
              <AppText
                variant="bodySmall"
                weight="bold"
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                  color: colors.textPrimary,
                  letterSpacing: 0.5,
                  textAlign: 'center',
                }}
              >
                {formulaClean}
              </AppText>
            </View>
          );
        }

        // Heading 3: ###
        if (line.startsWith('### ')) {
          return (
            <View key={lineIndex} style={{ marginTop: 8, marginBottom: 2 }}>
              <AppText variant="bodySmall" weight="bold" style={{ fontSize: 14, color: colors.textPrimary }}>
                {line.slice(4)}
              </AppText>
            </View>
          );
        }

        // Heading 4: ####
        if (line.startsWith('#### ')) {
          return (
            <View key={lineIndex} style={{ marginTop: 6, marginBottom: 2 }}>
              <AppText variant="caption" weight="bold" style={{ fontSize: 12.5, color: colors.textPrimary }}>
                {line.slice(5)}
              </AppText>
            </View>
          );
        }

        // Callout Quote: >
        if (line.startsWith('> ')) {
          return (
            <View
              key={lineIndex}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: colors.border,
                paddingLeft: 10,
                paddingVertical: 2,
                marginVertical: 4,
                backgroundColor: colors.divider,
                borderRadius: 4,
              }}
            >
              <AppText variant="caption" tone="secondary" style={{ fontStyle: 'italic', lineHeight: 18 }}>
                {line.slice(2)}
              </AppText>
            </View>
          );
        }

        // Bullet list item
        if (line.startsWith('* ') || line.startsWith('- ')) {
          return (
            <View key={lineIndex} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 4 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: colors.textSecondary,
                  marginTop: 7,
                  flexShrink: 0,
                }}
              />
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {renderInline(line.slice(2), `bullet-${lineIndex}`)}
              </View>
            </View>
          );
        }

        // Numbered list item
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <View key={lineIndex} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 2 }}>
              <AppText variant="caption" weight="bold" style={{ color: colors.textSecondary, width: 18, marginTop: 1 }}>
                {`${numMatch[1]}.`}
              </AppText>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {renderInline(numMatch[2], `num-${lineIndex}`)}
              </View>
            </View>
          );
        }

        // Standard Paragraph Line
        return (
          <View key={lineIndex} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {renderInline(line, `p-${lineIndex}`)}
          </View>
        );
      })}
    </View>
  );
}

export function AICopilotModal({
  visible,
  onClose,
  initialCourse,
  initialPrompt,
}: AICopilotModalProps) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { isFeatureEnabled } = useFeatureFlags();
  const toast = useToast();

  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [activeMode, setActiveMode] = useState<CopilotMode>('explain');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [attachedImage, setAttachedImage] = useState<{
    base64: string;
    mimeType: string;
    previewUri: string;
  } | null>(null);

  const isEnabled = isFeatureEnabled('ai_study_copilot');

  if (!isEnabled) return null;

  function handleNewConversation() {
    haptics.medium();
    setMessages([INITIAL_GREETING]);
    setPrompt('');
    setAttachedImage(null);
    setActiveMode('explain');
    toast.success('Started a fresh AI study session');
  }

  async function handlePickPhoto() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        document.body.removeChild(input);
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl) {
            setAttachedImage({
              base64: dataUrl,
              mimeType: file.type || 'image/jpeg',
              previewUri: dataUrl,
            });
            haptics.light();
            toast.info('Attached image for multimodal analysis');
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        setAttachedImage({
          base64: asset.base64 || '',
          mimeType: asset.mimeType || 'image/jpeg',
          previewUri: asset.uri,
        });
        toast.info('Attached image for multimodal analysis');
      }
    } catch {
      toast.warning('Unable to attach photo');
    }
  }

  async function handleSend(customText?: string, mode?: CopilotMode) {
    const textToSend = customText || prompt;
    if (!textToSend.trim() && !attachedImage) return;

    const chosenMode = mode || activeMode;
    const currentAttachment = attachedImage;

    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend || (chosenMode === 'math_solve' ? 'Please solve this handwritten math / equation' : 'Analyze this image'),
      mode: chosenMode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imageUri: currentAttachment?.previewUri,
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setAttachedImage(null);
    setLoading(true);

    try {
      const payloadAttachment: MultimodalAttachment | undefined = currentAttachment
        ? { base64: currentAttachment.base64, mimeType: currentAttachment.mimeType }
        : undefined;

      const res: CopilotResponse = await askAiStudyCopilot(
        userMsg.text,
        chosenMode,
        initialCourse,
        payloadAttachment
      );

      const aiMsg: ChatMessage = {
        id: 'ai-' + Date.now(),
        sender: 'ai',
        text: res.content,
        mode: res.mode,
        source: res.source,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      toast.warning('AI response generation issue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.overlay,
          {
            paddingTop: isDesktop ? 12 : Math.max(insets.top, 12),
            paddingBottom: isDesktop ? 12 : Math.max(insets.bottom, 12),
            paddingHorizontal: isDesktop ? 12 : 8,
          },
        ]}
      >
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 720 : '100%',
              maxHeight: isDesktop ? '90%' : '98%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Ionicons name="sparkles" size={18} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  {isDesktop ? 'Lioris Academic AI' : 'Lioris AI'}
                </AppText>
                <Badge label="Google Gemini 3.6 Flash" tone="brand" />
              </View>
              <AppText variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                {initialCourse ? `Focus: ${initialCourse} • Multimodal Math & Exam Revision` : 'Multimodal math, chalkboard diagrams, and exam revision powered by Google Gemini'}
              </AppText>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <Pressable
                onPress={handleNewConversation}
                hitSlop={8}
                style={[styles.headerActionBtn, { backgroundColor: colors.brandPrimary + '15' }]}
              >
                <Ionicons name="refresh" size={14} color={colors.brandPrimary} />
                <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, marginLeft: 4 }}>
                  New
                </AppText>
              </Pressable>

              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[styles.closeBtn, { backgroundColor: colors.textSecondary + '15' }]}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Quick Prompts Carousel */}
          <View style={{ marginBottom: 10 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {QUICK_PROMPTS.map((qp) => {
                const isSelected = activeMode === qp.mode;
                return (
                  <Pressable
                    key={qp.mode}
                    onPress={() => {
                      haptics.light();
                      setActiveMode(qp.mode);
                      if (!prompt) {
                        setPrompt(qp.text);
                      }
                    }}
                    style={[
                      styles.quickChip,
                      {
                        backgroundColor: isSelected ? colors.brandPrimary : colors.border + '35',
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                        borderWidth: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                      },
                    ]}
                  >
                    <Ionicons
                      name={qp.icon}
                      size={13}
                      color={isSelected ? '#ffffff' : colors.brandPrimary}
                    />
                    <AppText
                      variant="caption"
                      weight={isSelected ? 'bold' : 'regular'}
                      style={{ color: isSelected ? '#ffffff' : colors.textPrimary }}
                    >
                      {qp.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Chat Messages */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.msgContainer,
                    isUser ? styles.userMsgRow : styles.aiMsgRow,
                  ]}
                >
                  <View
                    style={[
                      styles.msgBubble,
                      {
                        backgroundColor: isUser ? colors.brandPrimary : colors.background,
                        borderColor: isUser ? colors.brandPrimary : colors.border,
                        borderRadius: radius.lg,
                        borderBottomRightRadius: isUser ? 4 : radius.lg,
                        borderBottomLeftRadius: isUser ? radius.lg : 4,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    {/* Header for AI response */}
                    {!isUser && (
                      <View style={styles.msgHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="sparkles" size={13} color={colors.textSecondary} />
                          <AppText variant="caption" weight="bold" style={{ color: colors.textSecondary, fontSize: 11 }}>
                            Lioris AI
                          </AppText>
                          {msg.source && <Badge label={msg.source === 'Academic Reasoning Engine' ? 'Offline template' : msg.source} tone={msg.source === 'Academic Reasoning Engine' ? 'neutral' : 'brand'} />}
                        </View>
                        <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                          {msg.timestamp}
                        </AppText>
                      </View>
                    )}

                    {/* Image Attachment Preview if user sent photo */}
                    {isUser && msg.imageUri && (
                      <View style={{ marginBottom: 6, borderRadius: 8, overflow: 'hidden' }}>
                        <Image source={{ uri: msg.imageUri }} style={{ width: 180, height: 120 }} resizeMode="cover" />
                      </View>
                    )}

                    {/* Message Body */}
                    <FormattedAcademicContent text={msg.text} isUser={isUser} colors={colors} />
                  </View>
                </View>
              );
            })}

            {loading && (
              <View style={[styles.msgContainer, styles.aiMsgRow]}>
                <View
                  style={[
                    styles.loadingBubble,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={colors.brandPrimary} style={{ marginRight: 8 }} />
                  <AppText variant="caption" tone="secondary">
                    Working on your question...
                  </AppText>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Attached Photo Preview Bar */}
          {attachedImage && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 6,
                borderRadius: 8,
                backgroundColor: colors.background,
                borderWidth: 1,
                borderColor: colors.brandPrimary + '50',
                marginBottom: 6,
              }}
            >
              <Image
                source={{ uri: attachedImage.previewUri }}
                style={{ width: 40, height: 40, borderRadius: 6 }}
                resizeMode="cover"
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="caption" weight="bold" numberOfLines={1}>
                  Photo Attached
                </AppText>
                <AppText variant="caption" tone="secondary" numberOfLines={1}>
                  Chalkboard / Diagram ready for multimodal solving
                </AppText>
              </View>
              <Pressable
                onPress={() => setAttachedImage(null)}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}

          {/* Input Bar */}
          <View style={[styles.inputBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable
              onPress={handlePickPhoto}
              hitSlop={8}
              style={{ padding: 4, marginRight: 4 }}
              accessibilityLabel="Attach chalkboard or diagram photo"
            >
              <Ionicons
                name="camera"
                size={20}
                color={attachedImage ? colors.brandPrimary : colors.textSecondary}
              />
            </Pressable>

            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={() => handleSend()}
              placeholder={
                activeMode === 'math_solve'
                  ? 'Attach chalkboard photo or paste formula...'
                  : activeMode === 'flashcards'
                  ? 'Enter topic or attach notes for flashcards...'
                  : 'Ask anything (e.g. solve Dijkstra algorithm)...'
              }
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              style={[styles.textInput, { color: colors.textPrimary }]}
            />

            <Pressable
              onPress={() => handleSend()}
              disabled={(!prompt.trim() && !attachedImage) || loading}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    prompt.trim() || attachedImage ? colors.brandPrimary : colors.border,
                },
              ]}
            >
              <Ionicons name="arrow-up" size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  modalContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  msgContainer: {
    width: '100%',
  },
  userMsgRow: {
    alignItems: 'flex-end',
  },
  aiMsgRow: {
    alignItems: 'flex-start',
  },
  msgBubble: {
    maxWidth: '94%',
    padding: 12,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 46,
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    height: '100%',
    paddingHorizontal: 4,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
});
