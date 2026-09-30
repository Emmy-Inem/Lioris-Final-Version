import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { createSupportTicket, SupportTicketCategory } from '@/api/supportTickets';
import { sendSupportChatMessage, formatChatTranscript, SupportChatTurn } from '@/api/supportChat';
import { addBreadcrumb } from '@/monitoring/breadcrumbs';
import { haptics } from '@/utils/haptics';

const TICKET_CATEGORIES: { key: SupportTicketCategory; label: string }[] = [
  { key: 'account_issue', label: 'Account Issue' },
  { key: 'matric_id_correction', label: 'Matric / ID Fix' },
  { key: 'campus_transfer', label: 'Campus Transfer' },
  { key: 'verification_appeal', label: 'Verification Appeal' },
  { key: 'bug_report', label: 'Report a Bug' },
  { key: 'feedback', label: 'Feedback / Suggestion' },
  { key: 'general', label: 'General Inquiry' },
];

type Mode = 'chat' | 'ticket';

export function HelpSupportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { isFeatureEnabled } = useFeatureFlags();
  const aiEnabled = isFeatureEnabled('ai_support_chat');

  const [mode, setMode] = useState<Mode>(aiEnabled ? 'chat' : 'ticket');

  // Chat state
  const [messages, setMessages] = useState<SupportChatTurn[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [lastNeedsHuman, setLastNeedsHuman] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Ticket state
  const [category, setCategory] = useState<SupportTicketCategory>('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [escalatedFromChat, setEscalatedFromChat] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function resetAll() {
    setMode(aiEnabled ? 'chat' : 'ticket');
    setMessages([]);
    setChatInput('');
    setLastNeedsHuman(false);
    setCategory('general');
    setTitle('');
    setDescription('');
    setEscalatedFromChat(false);
  }

  function handleClose() {
    onClose();
    resetAll();
  }

  async function handleSendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    haptics.light();
    const nextMessages: SupportChatTurn[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setChatInput('');
    setChatBusy(true);
    try {
      const result = await sendSupportChatMessage(text, messages);
      setMessages([...nextMessages, { role: 'assistant', content: result.content }]);
      setLastNeedsHuman(result.needsHuman);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: err?.message || "I couldn't respond just now. You can open a support ticket instead." },
      ]);
      setLastNeedsHuman(true);
    } finally {
      setChatBusy(false);
    }
  }

  function handleEscalate() {
    haptics.medium();
    setDescription(formatChatTranscript(messages));
    setTitle(messages.find((m) => m.role === 'user')?.content.slice(0, 80) || 'Question from AI chat');
    setEscalatedFromChat(true);
    setMode('ticket');
  }

  function handleQuickTicket(cat: SupportTicketCategory) {
    haptics.light();
    setCategory(cat);
    setEscalatedFromChat(false);
    setDescription('');
    setTitle('');
    setMode('ticket');
  }

  async function handleSubmitTicket() {
    if (!description.trim()) {
      toast.error('Please describe your issue before submitting.');
      return;
    }
    setSubmitting(true);
    addBreadcrumb('action', 'Submitted a support ticket', { category, escalatedFromChat });
    try {
      await createSupportTicket({
        category,
        title: title.trim() || 'General Issue Request',
        description: description.trim(),
        priority: 'medium',
        origin: escalatedFromChat ? 'ai_escalation' : 'user',
        chatTranscript: escalatedFromChat ? formatChatTranscript(messages) : undefined,
      });
      toast.success('Your ticket has been submitted to the university admin desk.');
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || 'Could not send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (visible && messages.length === 0 && aiEnabled) {
      setMessages([
        {
          role: 'assistant',
          content: "Hi! I'm the Lioris support assistant. Ask me anything about using the app - if I can't help, I'll get you to a human right away.",
        },
      ]);
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: spacing.lg,
            width: '100%',
            maxWidth: 520,
            maxHeight: '90%',
            gap: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <AppText variant="h3" weight="bold">
                Help & Support
              </AppText>
              <AppText tone="secondary" variant="caption">
                {mode === 'chat' ? 'Ask the assistant, or report an issue directly' : 'Submit to the admin support desk'}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleClose}
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Quick actions row - always visible, both modes */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {aiEnabled && (
              <Pressable
                onPress={() => setMode('chat')}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: mode === 'chat' ? colors.brandPrimary : colors.background,
                  borderWidth: 1,
                  borderColor: mode === 'chat' ? colors.brandPrimary : colors.border,
                }}
              >
                <Ionicons name="sparkles" size={12} color={mode === 'chat' ? '#FFFFFF' : colors.textSecondary} />
                <AppText variant="caption" weight="bold" style={{ color: mode === 'chat' ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                  AI Assistant
                </AppText>
              </Pressable>
            )}
            <Pressable
              onPress={() => handleQuickTicket('bug_report')}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: mode === 'ticket' && category === 'bug_report' ? colors.brandPrimary : colors.background, borderWidth: 1, borderColor: mode === 'ticket' && category === 'bug_report' ? colors.brandPrimary : colors.border }}
            >
              <AppText variant="caption" weight="bold" style={{ color: mode === 'ticket' && category === 'bug_report' ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                Report a Bug
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => handleQuickTicket('feedback')}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: mode === 'ticket' && category === 'feedback' ? colors.brandPrimary : colors.background, borderWidth: 1, borderColor: mode === 'ticket' && category === 'feedback' ? colors.brandPrimary : colors.border }}
            >
              <AppText variant="caption" weight="bold" style={{ color: mode === 'ticket' && category === 'feedback' ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                Give Feedback
              </AppText>
            </Pressable>
            {mode === 'ticket' && (
              <Pressable
                onPress={() => handleQuickTicket('general')}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: category === 'general' ? colors.brandPrimary : colors.background, borderWidth: 1, borderColor: category === 'general' ? colors.brandPrimary : colors.border }}
              >
                <AppText variant="caption" weight="bold" style={{ color: category === 'general' ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                  Other
                </AppText>
              </Pressable>
            )}
          </View>

          {mode === 'chat' ? (
            <>
              <ScrollView
                ref={scrollRef}
                style={{ maxHeight: isDesktop ? 380 : 320 }}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              >
                {messages.map((m, i) => (
                  <View
                    key={i}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      backgroundColor: m.role === 'user' ? colors.brandPrimary : colors.background,
                      borderRadius: 14,
                      borderWidth: m.role === 'user' ? 0 : 1,
                      borderColor: colors.border,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <AppText
                      variant="bodySmall"
                      style={{ color: m.role === 'user' ? '#FFFFFF' : colors.textPrimary, lineHeight: 19 }}
                    >
                      {m.content}
                    </AppText>
                  </View>
                ))}
                {chatBusy && (
                  <View style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 }}>
                    <ActivityIndicator size="small" color={colors.brandPrimary} />
                  </View>
                )}
              </ScrollView>

              {lastNeedsHuman && !chatBusy && messages.length > 1 && (
                <View style={{ backgroundColor: colors.divider, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="person-outline" size={16} color={colors.brandPrimary} />
                  <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                    This needs a human to look at it.
                  </AppText>
                  <AppButton label="Open a Ticket" size="sm" variant="secondary" onPress={handleEscalate} />
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
                <TextInput
                  accessibilityLabel="Type your question"
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ask a question..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: colors.textPrimary,
                    fontSize: 13,
                    maxHeight: 90,
                  }}
                  onSubmitEditing={handleSendChat}
                />
                <Pressable
                  onPress={handleSendChat}
                  disabled={!chatInput.trim() || chatBusy}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: !chatInput.trim() || chatBusy ? colors.divider : colors.brandPrimary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="send" size={17} color={!chatInput.trim() || chatBusy ? colors.textSecondary : '#FFFFFF'} />
                </Pressable>
              </View>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
              {escalatedFromChat && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.divider, padding: spacing.sm, borderRadius: radius.md }}>
                  <Ionicons name="sparkles" size={13} color={colors.brandPrimary} />
                  <AppText variant="caption" tone="secondary" style={{ flex: 1 }}>
                    Your AI chat conversation is attached below for the admin's context.
                  </AppText>
                </View>
              )}

              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Issue Category
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TICKET_CATEGORIES.map((cat) => {
                    const isSelected = category === cat.key;
                    return (
                      <Pressable
                        key={cat.key}
                        onPress={() => setCategory(cat.key)}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: isSelected ? colors.brandPrimary : colors.background,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <AppText
                          variant="caption"
                          weight={isSelected ? 'bold' : undefined}
                          style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}
                        >
                          {cat.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Subject / Summary
                </AppText>
                <TextInput
                  accessibilityLabel="e.g., Request to update matriculation number"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Request to update matriculation number"
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: colors.textPrimary,
                    fontSize: 13,
                  }}
                />
              </View>

              <View>
                <AppText variant="caption" weight="medium" tone="secondary" style={{ marginBottom: 6 }}>
                  Details & Description
                </AppText>
                <TextInput
                  accessibilityLabel="Provide complete details"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Provide complete details (current details vs correct details, evidence, error codes)..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={5}
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 10,
                    padding: 12,
                    color: colors.textPrimary,
                    fontSize: 13,
                    minHeight: 120,
                    textAlignVertical: 'top',
                  }}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <AppButton
                    label={aiEnabled ? 'Back to Assistant' : 'Cancel'}
                    variant="secondary"
                    onPress={() => (aiEnabled ? setMode('chat') : handleClose())}
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <AppButton
                    label={submitting ? 'Submitting...' : 'Submit to Admin Desk'}
                    onPress={handleSubmitTicket}
                    loading={submitting}
                  />
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
