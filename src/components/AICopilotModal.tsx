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
import { AppButton } from '@/components/AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { useToast } from '@/context/ToastContext';
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

const QUICK_PROMPTS: { label: string; mode: CopilotMode; text: string }[] = [
  { label: 'Explain Concept', mode: 'explain', text: 'Explain the principles of Object-Oriented Design simply' },
  { label: 'Past Question', mode: 'past_question', text: 'Break down a past question on Dijkstra Shortest Path' },
  { label: 'Revision Quiz', mode: 'quiz', text: 'Generate 3 high-yield questions on Operating Systems memory paging' },
  { label: 'Study Schedule', mode: 'schedule', text: 'Create a 3-day exam timetable for engineering finals' },
];

export function AICopilotModal({
  visible,
  onClose,
  initialCourse,
}: AICopilotModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const { isFeatureEnabled } = useFeatureFlags();
  const toast = useToast();

  const [prompt, setPrompt] = useState('');
  const [activeMode, setActiveMode] = useState<CopilotMode>('explain');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Hello! I am your AI Study Copilot powered by Google Gemini and academic reasoning algorithms. Ask me to explain a tough concept, break down a past question step-by-step, or generate an exam revision quiz!',
      source: 'Academic Reasoning Engine',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const isEnabled = isFeatureEnabled('ai_study_copilot');

  if (!isEnabled) return null;

  async function handleSend(customText?: string, mode?: CopilotMode) {
    const textToSend = customText || prompt;
    if (!textToSend.trim()) return;

    const chosenMode = mode || activeMode;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
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
        id: `ai-${Date.now()}`,
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
              width: isDesktop ? 680 : '94%',
              maxHeight: isDesktop ? '88%' : '92%',
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={20} color={colors.brandPrimary} />
                <AppText variant="h3" weight="bold">
                  AI Academic Study Copilot
                </AppText>
              </View>
              <AppText variant="caption" tone="secondary" numberOfLines={1}>
                {initialCourse ? `Focus Course: ${initialCourse}` : 'Google Gemini reasoning assistant'}
              </AppText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={[styles.closeBtn, { backgroundColor: `${colors.textSecondary}15` }]}
            >
              <Ionicons name="close" size={18} color={colors.textPrimary} />
            </Pressable>
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
                  style={[styles.quickChip, { backgroundColor: `${colors.brandPrimary}15` }]}
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
                  <AppText
                    variant="bodySmall"
                    style={{
                      color: msg.sender === 'user' ? '#ffffff' : colors.textPrimary,
                      lineHeight: 20,
                      marginTop: 4,
                    }}
                  >
                    {msg.text}
                  </AppText>
                </SolidCard>
              </View>
            ))}

            {loading && (
              <View style={styles.loadingBubble}>
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <AppText variant="caption" tone="secondary" style={{ marginLeft: 8 }}>
                  Generating academic breakdown...
                </AppText>
              </View>
            )}
          </ScrollView>

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
    maxWidth: '92%',
    padding: 12,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
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
    marginTop: 8,
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
