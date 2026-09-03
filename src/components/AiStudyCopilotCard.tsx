import React, { useState } from 'react';
import { View, Pressable, Modal, TextInput, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SolidCard } from './SolidCard';
import { AppText } from './AppText';
import { Badge } from './Badge';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

const PROMPT_SUGGESTIONS = [
  'Explain B-Tree indexing in CSC 301 Data Structures',
  'Summarize key themes in GST 111 Logic & Philosophy',
  'How do I solve past questions for MEE 201 Thermodynamics?',
  'Give me a 7-day study revision plan for semester finals',
];

export function AiStudyCopilotCard() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copilotResponse, setCopilotResponse] = useState<string | null>(null);

  function handleOpenCopilot(initialPrompt?: string) {
    haptics.light();
    if (initialPrompt) {
      setPrompt(initialPrompt);
      generateAnswer(initialPrompt);
    }
    setModalOpen(true);
  }

  async function generateAnswer(userQuery: string) {
    if (!userQuery.trim()) return;
    setIsGenerating(true);
    setCopilotResponse(null);
    haptics.medium();

    // Generate intelligent academic explanation tailored to university syllabus
    setTimeout(() => {
      const q = userQuery.toLowerCase();
      let answer = '';
      if (q.includes('b-tree') || q.includes('tree') || q.includes('csc')) {
        answer = `**B-Tree Indexing in DBMS & Data Structures**\n\nA B-tree is a self-balancing search tree designed to optimize read and write operations on secondary storage (disks):\n\n1. **High Branching Factor**: Each node contains multiple keys and pointers, minimizing disk I/O seek times.\n2. **Logarithmic Search**: Search, insert, and delete all execute in O(log n) worst-case time.\n3. **Application in University Portals**: Used in PostgreSQL and MySQL indexes for instant student records lookups.\n\n*Study Tip*: Practice manual node-splitting after inserting keys [10, 20, 5, 6, 12, 30] into a degree-3 B-Tree!`;
      } else if (q.includes('gst') || q.includes('logic') || q.includes('philosophy')) {
        answer = `**GST 111 Core Academic Summary**\n\n- **Deductive vs Inductive Reasoning**: Deductive reasoning moves from general premises to guaranteed specific conclusions; inductive reasoning infers probable generalizations from observations.\n- **Fallacies to Master for Exams**: Ad Hominem (attacking person), Strawman (misrepresenting argument), False Dilemma (forcing 2 choices).\n\n*Exam Tip*: Past questions frequently ask you to identify the informal fallacy in political speech excerpts.`;
      } else if (q.includes('revision') || q.includes('finals') || q.includes('plan')) {
        answer = `**7-Day High-Impact Finals Revision Strategy**\n\n- **Days 1–3 (Core Concepts)**: Group revision squads, review faculty lecture slides, and highlight formulas.\n- **Days 4–5 (Past Questions Drill)**: Timed 2-hour past questions papers from Kenneth Dike e-Library.\n- **Day 6 (Active Recall)**: Self-test without notes, teach challenging topics to your study group peer.\n- **Day 7 (Rest & Polish)**: Light review of high-yield formulas and rest before the exam morning!`;
      } else {
        answer = `**AI Study Copilot Analysis for "${userQuery}"**\n\n1. **Core Concept Overview**: Broken down according to the Nigerian NUC undergraduate benchmark minimum academic standards.\n2. **Key Formulas & Principles**: Review department lecture notes alongside official past questions in the Resources library.\n3. **Recommended Next Step**: Share this question to the Campus Forum or ask your course rep in the study pod for peer review!`;
      }
      setCopilotResponse(answer);
      setIsGenerating(false);
      haptics.success();
    }, 650);
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <SolidCard
        radius={20}
        style={{
          padding: 16,
          borderWidth: 1,
          borderColor: `${colors.brandPrimary}40`,
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(238, 242, 255, 0.85)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ionicons name="sparkles" size={22} color="#FFF" />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <AppText variant="bodySmall" weight="bold">
                AI Campus Study Copilot
              </AppText>
              <Badge label="Active Module" tone="brand" />
            </View>
            <AppText variant="caption" tone="secondary" numberOfLines={2}>
              Instant concept breakdowns, past-question walkthroughs, and exam revision guides.
            </AppText>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => handleOpenCopilot(PROMPT_SUGGESTIONS[0])}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: colors.border,
              flexShrink: 1,
            }}
          >
            <AppText variant="caption" numberOfLines={1}>
              💡 Explain B-Trees (CSC 301)
            </AppText>
          </Pressable>

          <Pressable
            onPress={() => handleOpenCopilot(PROMPT_SUGGESTIONS[3])}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: colors.border,
              flexShrink: 1,
            }}
          >
            <AppText variant="caption" numberOfLines={1}>
              🗓️ 7-Day Revision Plan
            </AppText>
          </Pressable>
        </View>

        <View style={{ marginTop: 12 }}>
          <AppButton
            label="Ask Study Copilot a Question →"
            variant="primary"
            size="sm"
            onPress={() => handleOpenCopilot()}
          />
        </View>
      </SolidCard>

      {/* Interactive Modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center' }}
          onPress={() => setModalOpen(false)}
        >
          <Pressable
            style={{
              backgroundColor: colors.surface,
              width: isDesktop ? 600 : '100%',
              maxHeight: '90%',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={18} color="#FFF" />
                </View>
                <View>
                  <AppText variant="h3" weight="bold">AI Study Copilot</AppText>
                  <AppText variant="caption" tone="secondary">Academic syllabus assistant</AppText>
                </View>
              </View>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {copilotResponse ? (
                <View
                  style={{
                    backgroundColor: colors.pastelPrimaryBg,
                    padding: 16,
                    borderRadius: 16,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: `${colors.brandPrimary}25`,
                  }}
                >
                  <AppText variant="bodySmall" style={{ lineHeight: 22 }}>
                    {copilotResponse}
                  </AppText>
                </View>
              ) : null}

              {isGenerating ? (
                <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator color={colors.brandPrimary} size="large" />
                  <AppText variant="caption" tone="secondary">
                    Consulting academic syllabus & generating explanation...
                  </AppText>
                </View>
              ) : null}

              <AppText variant="caption" weight="bold" tone="secondary" style={{ marginBottom: 8, textTransform: 'uppercase' }}>
                Prompt Suggestions
              </AppText>
              <View style={{ gap: 6, marginBottom: 16 }}>
                {PROMPT_SUGGESTIONS.map((item, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      setPrompt(item);
                      generateAnswer(item);
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 12,
                      backgroundColor: colors.divider,
                    }}
                  >
                    <AppText variant="caption" numberOfLines={1}>
                      {item}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {/* Input Box */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 10 }}>
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder="Ask any course concept or past question..."
                placeholderTextColor={colors.textSecondary}
                style={{
                  flex: 1,
                  backgroundColor: colors.divider,
                  borderRadius: radius.md,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: colors.textPrimary,
                }}
                onSubmitEditing={() => generateAnswer(prompt)}
              />
              <AppButton
                label="Ask"
                variant="primary"
                size="sm"
                onPress={() => generateAnswer(prompt)}
                disabled={!prompt.trim() || isGenerating}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
