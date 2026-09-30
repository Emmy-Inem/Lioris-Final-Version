import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

type FaqCategory = 'Account' | 'Forum' | 'Events' | 'Jobs & Marketplace' | 'Mentorship' | 'Alumni & Giving' | 'Privacy & Data';

interface FaqEntry {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
}

const CATEGORIES: FaqCategory[] = ['Account', 'Forum', 'Events', 'Jobs & Marketplace', 'Mentorship', 'Alumni & Giving', 'Privacy & Data'];

const FAQS: FaqEntry[] = [
  {
    id: 'verify-account',
    category: 'Account',
    question: 'How do I get my account verified?',
    answer:
      'Sign up with your official campus email and upload your student/staff ID when prompted. Verification is usually automatic; if it stays pending, a campus admin reviews it manually - you can check the status any time under Settings.',
  },
  {
    id: 'forgot-password',
    category: 'Account',
    question: 'I forgot my password. What do I do?',
    answer: 'On the sign-in screen, tap "Forgot password?" and follow the email link. If you no longer have access to that email, open a support ticket and we will help you regain access.',
  },
  {
    id: 'change-email',
    category: 'Account',
    question: 'Can I change the email address on my account?',
    answer: 'Yes - go to Settings > Security & Credentials > Change Email. You will need to confirm the new address with a code before it takes effect.',
  },
  {
    id: 'matric-wrong',
    category: 'Account',
    question: 'My matric/staff ID number is wrong. How do I fix it?',
    answer: 'Open Settings > Help & Support and choose "Matric / ID Fix" as the category. Include your correct ID number and, if you have one, a photo of your ID card - this speeds up the review.',
  },
  {
    id: 'deactivate-vs-delete',
    category: 'Account',
    question: "What's the difference between deactivating and deleting my account?",
    answer:
      'Deactivating pauses your account and signs you out - nothing is deleted, and logging back in reactivates it automatically. Deleting is permanent: your profile, posts, messages and uploads are erased and cannot be recovered. Both are in Settings > Privacy & Data.',
  },
  {
    id: 'post-report',
    category: 'Forum',
    question: 'How do I report a post, comment or user?',
    answer: 'Tap the "..." menu on a post, comment, listing or job, and choose Report. Give a short reason - campus moderators review every report and you will be notified once it is actioned.',
  },
  {
    id: 'forum-communities',
    category: 'Forum',
    question: 'What are forum communities?',
    answer: 'Communities are topic or department-specific discussion spaces inside the forum. Join the ones relevant to you from the Forum tab to see their posts mixed into your feed and get notified of new activity.',
  },
  {
    id: 'event-rsvp',
    category: 'Events',
    question: 'How do I RSVP to an event, and what if it is full?',
    answer:
      'Open the event and tap RSVP. If the event is at capacity, you can join the waitlist - if a spot opens up, you are automatically promoted and notified.',
  },
  {
    id: 'paid-event',
    category: 'Events',
    question: 'How do paid events work?',
    answer: 'Paid events show the price and payment instructions on the event page after admin review. Lioris does not process payment directly for peer-run events - always verify the organiser before paying.',
  },
  {
    id: 'job-apply',
    category: 'Jobs & Marketplace',
    question: 'How do I apply to a job posting?',
    answer: 'Postings that accept in-app applications have an "Apply in Lioris" button - attach your CV and answer any screening questions. Others link out to the employer\'s own site.',
  },
  {
    id: 'job-posting-review',
    category: 'Jobs & Marketplace',
    question: 'Why is my job posting "Pending Review"?',
    answer: "Postings from students and alumni are held for a quick moderation check before going live, to keep the career board spam-free. Staff and admin postings go live immediately. This usually clears within a day.",
  },
  {
    id: 'marketplace-safety',
    category: 'Jobs & Marketplace',
    question: 'Is it safe to buy or sell on the Marketplace?',
    answer:
      "Lioris does not process payment or inspect items - it's peer-to-peer. Meet in a public campus location, inspect the item before paying, and never send money in advance. Report a listing if something looks like a scam.",
  },
  {
    id: 'mentorship-request',
    category: 'Mentorship',
    question: 'How do I find and request a mentor?',
    answer: 'Browse the mentor directory under Mentorship, filter by expertise or industry, and send a request with a short note about what you are hoping to get out of it. The mentor can accept, decline, or suggest a different focus.',
  },
  {
    id: 'mentorship-end',
    category: 'Mentorship',
    question: 'How do I end a mentorship?',
    answer: 'Either participant can mark it complete (if it went well) or end it early from the mentorship page. If something is wrong with the pairing, you can also report the other person and campus staff can step in.',
  },
  {
    id: 'alumni-directory',
    category: 'Alumni & Giving',
    question: 'How do I find alumni in my field?',
    answer: 'Use the Alumni Directory filters (industry, company, graduation year, location) to narrow the list, then reach out through in-app messaging.',
  },
  {
    id: 'donations',
    category: 'Alumni & Giving',
    question: 'How do campus giving campaigns work?',
    answer: 'Verified campaigns show a goal, progress, and a secure giving link. Every campaign not created by an admin is reviewed before it goes live, to keep fundraising legitimate.',
  },
  {
    id: 'who-sees-profile',
    category: 'Privacy & Data',
    question: 'Who can see my profile?',
    answer: 'By default, verified classmates on your campus can find you in search and study pods (Settings > Privacy & Data > Campus Directory Discovery). Turn that off to stop appearing in directory search - your posts and public activity are still visible per the normal campus-visibility rules.',
  },
  {
    id: 'export-data',
    category: 'Privacy & Data',
    question: 'Can I get a copy of my data?',
    answer: 'Yes - Settings > Privacy & Data > Export my data downloads a JSON file with the personal data Lioris holds about you.',
  },
  {
    id: 'notification-prefs',
    category: 'Privacy & Data',
    question: 'How do I control what notifications I get?',
    answer: 'Settings > Notification Preferences lets you turn off push notifications entirely, or mute just campus announcements or event reminders - your choice is respected server-side, not just on this device.',
  },
];

export function FaqHelpCenterModal({ visible, onClose, onContactSupport }: { visible: boolean; onClose: () => void; onContactSupport?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FaqCategory | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQS.filter((f) => {
      if (activeCategory && f.category !== activeCategory) return false;
      if (!q) return true;
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
    });
  }, [query, activeCategory]);

  function handleClose() {
    onClose();
    setQuery('');
    setActiveCategory(null);
    setExpandedId(null);
  }

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
            maxWidth: 560,
            maxHeight: '90%',
            gap: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <AppText variant="h3" weight="bold">
                FAQ & Help Center
              </AppText>
              <AppText tone="secondary" variant="caption">
                Answers to common questions
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

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.background,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: spacing.md,
              height: 38,
            }}
          >
            <Ionicons name="search" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search questions..."
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 13 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ flexGrow: 0 }}>
            <Pressable
              onPress={() => {
                haptics.light();
                setActiveCategory(null);
              }}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: radius.pill,
                backgroundColor: activeCategory === null ? colors.brandPrimary : colors.background,
                borderWidth: 1,
                borderColor: activeCategory === null ? colors.brandPrimary : colors.border,
              }}
            >
              <AppText variant="caption" weight="bold" style={{ color: activeCategory === null ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                All
              </AppText>
            </Pressable>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  haptics.light();
                  setActiveCategory(c);
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: activeCategory === c ? colors.brandPrimary : colors.background,
                  borderWidth: 1,
                  borderColor: activeCategory === c ? colors.brandPrimary : colors.border,
                }}
              >
                <AppText variant="caption" weight="bold" style={{ color: activeCategory === c ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                  {c}
                </AppText>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
            {filtered.map((f) => {
              const expanded = expandedId === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    haptics.light();
                    setExpandedId(expanded ? null : f.id);
                  }}
                  style={{
                    backgroundColor: colors.background,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: spacing.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                    <AppText variant="bodySmall" weight="bold" style={{ flex: 1 }}>
                      {f.question}
                    </AppText>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
                  </View>
                  {expanded ? (
                    <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 6, lineHeight: 19 }}>
                      {f.answer}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs }}>
                <Ionicons name="help-circle-outline" size={28} color={colors.textSecondary} />
                <AppText tone="secondary" variant="bodySmall">
                  No matching questions.
                </AppText>
              </View>
            ) : null}
          </ScrollView>

          {onContactSupport ? (
            <View style={{ paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
              <AppButton
                label="Still need help? Contact Support"
                variant="secondary"
                onPress={() => {
                  handleClose();
                  onContactSupport();
                }}
              />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
