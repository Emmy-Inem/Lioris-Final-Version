import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  CopilotError,
  CopilotMode,
  CopilotResponse,
  MAX_PROMPT_CHARS,
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
  /**
   * 'ai' is a genuine Gemini answer. 'template' is a pre-written offline study scaffold and is
   * always badged as such - it must never be dressed up as a model answer. 'error' is an honest
   * failure notice; 'system' is the opening greeting.
   */
  sender: 'user' | 'ai' | 'template' | 'error' | 'system';
  text: string;
  mode?: CopilotMode;
  /** Gemini model id as reported by the proxy. Only set on 'ai' messages. */
  model?: string;
  timestamp: string;
  imageUri?: string;
  /** Present on an 'error' message when a labelled offline template can be offered instead. */
  offlineTemplate?: CopilotResponse;
  /** True once the user has asked to see that template, so the offer disappears. */
  templateShown?: boolean;
}

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  sender: 'system',
  text: 'Hello! I am your Lioris study assistant, powered by Google Gemini. Ask me to explain a concept, break down a past question, or generate revision flashcards - you can also attach a photo of chalkboard maths or a diagram. You need to be signed in to your Lioris account to use it.',
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

  const scrollRef = useRef<ScrollView | null>(null);
  // Remembers the last seeded prompt so re-renders do not fire the same auto-question twice.
  const autoSentPromptRef = useRef<string | null>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  /**
   * `initialPrompt` used to be read only by `useState(initialPrompt || '')`, which runs once when
   * the modal first mounts. Because the modal stays mounted and merely toggles `visible`, every
   * later hand-off (e.g. "Analyze AI" in the research modal) was silently dropped and the copilot
   * opened empty. Seed it on each open instead, and send it straight away.
   */
  useEffect(() => {
    if (!visible) {
      autoSentPromptRef.current = null;
      return;
    }
    const seed = (initialPrompt || '').trim();
    if (!seed || autoSentPromptRef.current === seed) return;
    autoSentPromptRef.current = seed;
    setActiveMode('explain');
    setPrompt('');
    void handleSend(seed, 'explain');
    // handleSend is re-created on every render; depending on it here would loop.
  }, [visible, initialPrompt]);

  const isEnabled = isFeatureEnabled('ai_study_copilot');

  if (!isEnabled) return null;

  const promptTooLong = prompt.trim().length > MAX_PROMPT_CHARS;

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
        model: res.model,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      // Never quietly substitute a canned template for an answer: say what actually failed.
      const copilotError = err instanceof CopilotError ? err : null;
      const errorMsg: ChatMessage = {
        id: 'err-' + Date.now(),
        sender: 'error',
        text:
          copilotError?.message ||
          'Something went wrong while contacting the AI service. Please try again.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        offlineTemplate: copilotError?.offlineTemplate,
      };
      setMessages((prev) => [...prev, errorMsg]);
      haptics.error();
    } finally {
      setLoading(false);
    }
  }

  function handleShowOfflineTemplate(errorMessageId: string, template: CopilotResponse) {
    haptics.light();
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === errorMessageId ? { ...m, templateShown: true } : m));
      return [
        ...next,
        {
          id: 'tpl-' + Date.now(),
          sender: 'template' as const,
          text: template.content,
          mode: template.mode,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                <Badge label="Google Gemini" tone="brand" />
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

              <Pressable accessibilityRole="button" accessibilityLabel="Close"
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
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
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={scrollToEnd}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isError = msg.sender === 'error';
              const isTemplate = msg.sender === 'template';

              const bubbleBackground = isUser
                ? colors.brandPrimary
                : isError
                ? colors.roseBg
                : colors.background;
              const bubbleBorder = isUser
                ? colors.brandPrimary
                : isError
                ? colors.critical
                : colors.border;

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
                        backgroundColor: bubbleBackground,
                        borderColor: bubbleBorder,
                        borderRadius: radius.lg,
                        borderBottomRightRadius: isUser ? 4 : radius.lg,
                        borderBottomLeftRadius: isUser ? radius.lg : 4,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    {/* Attribution header - says exactly what produced this bubble */}
                    {!isUser && (
                      <View style={styles.msgHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 1 }}>
                          <Ionicons
                            name={isError ? 'alert-circle' : isTemplate ? 'document-text-outline' : 'sparkles'}
                            size={13}
                            color={isError ? colors.critical : colors.textSecondary}
                          />
                          <AppText variant="caption" weight="bold" style={{ color: colors.textSecondary, fontSize: 11 }}>
                            {isError ? 'AI unavailable' : isTemplate ? 'Offline study template' : 'Lioris AI'}
                          </AppText>
                          {msg.sender === 'ai' && (
                            <Badge label={msg.model ? `Google ${msg.model}` : 'Google Gemini'} tone="brand" />
                          )}
                          {isTemplate && <Badge label="Not an AI answer" tone="neutral" />}
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

                    {/* Offer the offline template only as an explicitly labelled extra */}
                    {isError && msg.offlineTemplate && !msg.templateShown && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handleShowOfflineTemplate(msg.id, msg.offlineTemplate!)}
                        style={{
                          marginTop: 10,
                          minHeight: 44,
                          justifyContent: 'center',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <AppText variant="caption" weight="bold" tone="primary" style={{ textAlign: 'center' }}>
                          Show an offline study template instead
                        </AppText>
                      </Pressable>
                    )}
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
                <AppText variant="caption" weight="bold">
                  Photo attached
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Chalkboard / diagram ready for multimodal solving
                </AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove attached photo"
                onPress={() => setAttachedImage(null)}
                hitSlop={12}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}

          {/* Over-length warning, shown before the user wastes a round-trip */}
          {promptTooLong && (
            <AppText variant="caption" style={{ color: colors.critical, marginBottom: 6 }}>
              {`That question is ${prompt.trim().length.toLocaleString()} characters. The limit is ${MAX_PROMPT_CHARS.toLocaleString()} - please shorten it.`}
            </AppText>
          )}

          {/* Input Bar */}
          <View style={[styles.inputBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable
              onPress={handlePickPhoto}
              hitSlop={8}
              style={styles.inputIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Attach chalkboard or diagram photo"
            >
              <Ionicons
                name="camera"
                size={20}
                color={attachedImage ? colors.brandPrimary : colors.textSecondary}
              />
            </Pressable>

            <TextInput accessibilityLabel="Message the AI assistant"
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={() => handleSend()}
              editable={!loading}
              multiline
              placeholder={
                activeMode === 'math_solve'
                  ? 'Attach chalkboard photo or paste formula'
                  : activeMode === 'flashcards'
                  ? 'Enter topic or attach notes for flashcards'
                  : 'Ask anything (e.g. solve Dijkstra algorithm)'
              }
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              blurOnSubmit
              style={[styles.textInput, { color: colors.textPrimary }]}
            />

            <Pressable accessibilityRole="button" accessibilityLabel={loading ? 'Waiting for the AI response' : 'Send message'}
              onPress={() => handleSend()}
              disabled={(!prompt.trim() && !attachedImage) || loading || promptTooLong}
              accessibilityState={{ disabled: (!prompt.trim() && !attachedImage) || loading || promptTooLong }}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    (prompt.trim() || attachedImage) && !loading && !promptTooLong
                      ? colors.brandPrimary
                      : colors.border,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="arrow-up" size={18} color="#ffffff" />
              )}
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    minHeight: 44,
    borderRadius: 14,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickChip: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
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
    // Bottom-aligned so the row grows downward as the (multiline) field wraps and the
    // send button stays on the same line as the last row of text.
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 52,
  },
  inputIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
});
