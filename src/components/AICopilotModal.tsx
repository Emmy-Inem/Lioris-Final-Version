import React, { useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
} from '@/api/aiCopilot';

interface AICopilotModalProps {
  visible: boolean;
  onClose: () => void;
  initialCourse?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  mode?: CopilotMode;
  source?: string;
  timestamp: string;
}

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome',
  sender: 'ai',
  text: 'Hello! I am your AI Study Copilot powered by Google Gemini and academic reasoning algorithms. Ask me to explain a tough concept, break down a past question step-by-step, or generate an exam revision quiz!',
  source: 'Academic Reasoning Engine',
  timestamp: 'Just now',
};

const QUICK_PROMPTS: { label: string; mode: CopilotMode; text: string }[] = [
  { label: 'Explain Concept', mode: 'explain', text: 'Explain the principles of Object-Oriented Design simply' },
  { label: 'Past Question', mode: 'past_question', text: 'Break down a past question on Dijkstra Shortest Path' },
  { label: 'Revision Quiz', mode: 'quiz', text: 'Generate 3 high-yield questions on Operating Systems memory paging' },
  { label: 'Study Schedule', mode: 'schedule', text: 'Create a 3-day exam timetable for engineering finals' },
];

/**
 * Elegant native text formatting component that renders structured headings,
 * callout quotes, bullet points, numbered steps, and bold terms without raw markdown symbols.
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
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
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
          <AppText
            key={keyPrefix + '-' + idx}
            variant="caption"
            weight="bold"
            style={{
              backgroundColor: colors.pastelPrimaryBg,
              color: colors.brandPrimary,
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: 4,
            }}
          >
            {part.slice(1, -1)}
          </AppText>
        );
      }
      return (
        <AppText key={keyPrefix + '-' + idx} variant="bodySmall" tone="primary" style={{ lineHeight: 20 }}>
          {part}
        </AppText>
      );
    });
  }

  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return <View key={idx} style={{ height: 4 }} />;

        // Header 3 (### )
        if (line.startsWith('### ')) {
          const headingText = line.replace('### ', '');
          return (
            <View key={idx} style={{ marginTop: 8, marginBottom: 2 }}>
              <AppText variant="h3" weight="bold" style={{ color: colors.brandPrimary }}>
                {headingText}
              </AppText>
            </View>
          );
        }

        // Header 4 (#### )
        if (line.startsWith('#### ')) {
          const headingText = line.replace('#### ', '');
          return (
            <View key={idx} style={{ marginTop: 6, marginBottom: 2 }}>
              <AppText variant="bodySmall" weight="bold" tone="primary">
                {headingText}
              </AppText>
            </View>
          );
        }

        // Divider (---)
        if (line === '---') {
          return (
            <View
              key={idx}
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: 6,
              }}
            />
          );
        }

        // Blockquote (> )
        if (line.startsWith('> ')) {
          const quoteText = line.replace(/^>\s*/, '');
          return (
            <View
              key={idx}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: colors.brandPrimary,
                backgroundColor: colors.pastelPrimaryBg,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                marginVertical: 4,
              }}
            >
              <AppText variant="bodySmall" weight="medium" tone="primary" style={{ fontStyle: 'italic' }}>
                {quoteText}
              </AppText>
            </View>
          );
        }

        // Bullet item (* or -)
        if (line.startsWith('* ') || line.startsWith('- ')) {
          const itemContent = line.replace(/^[*-]\s+/, '');
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginVertical: 2 }}>
              <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} style={{ marginTop: 3 }} />
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                {renderInline(itemContent, 'bullet-' + idx)}
              </View>
            </View>
          );
        }

        // Numbered list item (e.g. 1. or 2.)
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          const num = numMatch[1];
          const itemContent = numMatch[2];
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginVertical: 2 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: colors.brandPrimary + '20',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary, fontSize: 10 }}>
                  {num}
                </AppText>
              </View>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                {renderInline(itemContent, 'num-' + idx)}
              </View>
            </View>
          );
        }

        // Standard paragraph
        return (
          <View key={idx} style={{ flexDirection: 'row', flexWrap: 'wrap', marginVertical: 1 }}>
            {renderInline(line, 'para-' + idx)}
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
}: AICopilotModalProps) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const toast = useToast();

  const [prompt, setPrompt] = useState('');
  const [activeMode, setActiveMode] = useState<CopilotMode>('explain');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);

  const isEnabled = isFeatureEnabled('ai_study_copilot');

  if (!isEnabled) return null;

  function handleNewConversation() {
    haptics.medium();
    setMessages([INITIAL_GREETING]);
    setPrompt('');
    setActiveMode('explain');
    toast.success('Started a fresh AI study session');
  }

  async function handleSend(customText?: string, mode?: CopilotMode) {
    const textToSend = customText || prompt;
    if (!textToSend.trim()) return;

    const chosenMode = mode || activeMode;
    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: textToSend,
      mode: chosenMode,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    try {
      const res: CopilotResponse = await askAiStudyCopilot(textToSend, chosenMode, initialCourse);
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
      toast.warning('Copilot response generation issue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              width: isDesktop ? 700 : '95%',
              maxHeight: isDesktop ? '88%' : '92%',
            },
          ]}
        >
          {/* Header Bar */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  AI Academic Study Copilot
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {initialCourse ? 'Focus Course: ' + initialCourse : 'Powered by Google Gemini & Academic Heuristic Engine'}
              </AppText>
            </View>

            {/* Action Buttons: New Chat & Close */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={handleNewConversation}
                hitSlop={8}
                style={[styles.headerActionBtn, { backgroundColor: colors.pastelPrimaryBg }]}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.brandPrimary} />
                {isDesktop && (
                  <AppText variant="caption" weight="bold" tone="brand" style={{ fontSize: 11, marginLeft: 4 }}>
                    New Chat
                  </AppText>
                )}
              </Pressable>

              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={[styles.closeBtn, { backgroundColor: colors.divider }]}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {/* Quick Starter Chips */}
          <View style={{ marginBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {QUICK_PROMPTS.map((qp) => (
                <Pressable
                  key={qp.label}
                  onPress={() => {
                    setActiveMode(qp.mode);
                    handleSend(qp.text, qp.mode);
                  }}
                  style={[styles.quickChip, { backgroundColor: colors.brandPrimary + '15' }]}
                >
                  <AppText variant="caption" weight="bold" style={{ color: colors.brandPrimary }}>
                    ⚡ {qp.label}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Messages Thread */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingVertical: 8, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[
                  styles.msgContainer,
                  msg.sender === 'user' ? styles.userMsgRow : styles.aiMsgRow,
                ]}
              >
                <SolidCard
                  radius={16}
                  style={[
                    styles.msgBubble,
                    msg.sender === 'user'
                      ? { backgroundColor: colors.brandPrimary, alignSelf: 'flex-end' }
                      : { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <View style={styles.msgHeader}>
                    <AppText
                      variant="caption"
                      weight="bold"
                      style={{ color: msg.sender === 'user' ? '#ffffff' : colors.textPrimary }}
                    >
                      {msg.sender === 'user' ? 'You' : 'Study Copilot'}
                    </AppText>
                    {msg.source && <Badge label={msg.source} tone="brand" />}
                  </View>

                  {/* Rich Formatted Content */}
                  <FormattedAcademicContent text={msg.text} isUser={msg.sender === 'user'} colors={colors} />
                </SolidCard>
              </View>
            ))}

            {loading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <AppText variant="caption" tone="secondary" style={{ marginLeft: 8 }}>
                  Analyzing academic concepts & deriving explanation...
                </AppText>
              </View>
            )}
          </ScrollView>

          {/* Bottom Chat Controls: Clear History link & Input Bar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 4 }}>
            <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
              Tips: Tap chips above or ask for exam solutions
            </AppText>
            {messages.length > 1 && (
              <Pressable onPress={handleNewConversation} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="trash-outline" size={12} color={colors.textSecondary} />
                <AppText variant="caption" tone="secondary" style={{ fontSize: 10 }}>
                  Clear History
                </AppText>
              </Pressable>
            )}
          </View>

          {/* Input Bar */}
          <View style={[styles.inputBar, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={() => handleSend()}
              placeholder="Ask anything (e.g. explain normalisation in databases)..."
              placeholderTextColor={colors.textSecondary}
              returnKeyType="send"
              style={[styles.textInput, { color: colors.textPrimary }]}
            />
            <Pressable
              onPress={() => handleSend()}
              disabled={!prompt.trim() || loading}
              style={[
                styles.sendBtn,
                { backgroundColor: prompt.trim() ? colors.brandPrimary : colors.border },
              ]}
            >
              <Ionicons name="arrow-up" size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    borderRadius: 22,
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
    marginBottom: 10,
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
    padding: 14,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
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
    paddingHorizontal: 12,
    height: 46,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
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
