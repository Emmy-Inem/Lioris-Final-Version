import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { ApplyForVerificationModal } from './ApplyForVerificationModal';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { markVerificationPending } from '@/api/profile';
import { submitVerificationRequest } from '@/api/verification';
import type { CampusAccess } from '@/api/campusAccess';
import { getFriendlyErrorMessage } from '@/utils/errors';

export type CampusLockedReason = CampusAccess['reason'];

interface CampusLockedCardProps {
  /** Why the campus is locked. Drives the wording and the call to action. */
  reason: CampusLockedReason;
  /** Human-readable campus name, e.g. "University of Lagos". */
  campusName?: string | null;
  /** What is locked, in the user's words: "feed", "events", "study groups". */
  surface?: string;
  /**
   * Overrides the call to action. Omit and the card opens the standard
   * "apply for verification" modal itself, so every locked surface offers
   * the same one-tap route out instead of re-implementing it.
   */
  onVerify?: () => void;
  /**
   * Optional aggregate shown ABOVE the lock, e.g. the campus event teaser
   * ("12 campus events this week"). Must never contain titles, venues or
   * dates - a count drives verification with zero leak.
   */
  teaser?: React.ReactNode;
}

interface Copy {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: string;
}

function copyFor(reason: CampusLockedReason, campus: string, surface: string): Copy {
  switch (reason) {
    case 'pending':
      return {
        icon: 'time-outline',
        title: 'Your student ID is under review',
        body: `We have your document. A campus moderator is checking it now. As soon as it is approved, the ${campus} ${surface} unlocks automatically - you do not need to send anything else.`,
        action: undefined,
      };
    case 'rejected':
      return {
        icon: 'refresh-outline',
        title: 'Your last verification was not approved',
        body: `We could not confirm that you belong to ${campus} from the document you sent. You can send a clearer photo of your student ID, admission letter or staff ID and we will look again.`,
        action: 'Re-apply for verification',
      };
    case 'no-campus':
      return {
        icon: 'school-outline',
        title: 'You have not joined a campus yet',
        body: 'Lioris is showing you the Global network. Tell us where you study and verify your student ID to get your campus feed, events, study groups and directory.',
        action: 'Choose my campus',
      };
    case 'verified':
    case 'admin':
    case 'staff':
    case 'unverified':
    default:
      return {
        icon: 'lock-closed-outline',
        title: `${campus} is for verified members`,
        body: `Anyone can say they study at ${campus}, so we only open the campus ${surface} to people who have proved it. Verify your student ID - most are approved the same day - and this unlocks for you.`,
        action: 'Verify my student ID',
      };
  }
}

/**
 * The single locked-state UI for every campus surface.
 *
 * This card does not restrict anything - by the time it renders, the database
 * has already returned nothing. It exists purely to explain an otherwise
 * mysterious empty screen and to give the user the one action that fixes it.
 */
export function CampusLockedCard({
  reason,
  campusName,
  surface = 'feed',
  onVerify,
  teaser,
}: CampusLockedCardProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  let user: { id: string; fullName: string } | undefined;
  try {
    user = useAuth()?.user ?? undefined;
  } catch {
    // Rendered outside AuthProvider (isolated previews / tests).
  }

  const campus = campusName?.trim() || 'your campus';
  const copy = copyFor(reason, campus, surface);

  async function handleSubmit(data: {
    institutionClaimed: string;
    documentType: 'Student ID' | 'Admission Letter' | 'Staff ID' | 'Alumni Certificate';
    documentReference?: string;
    documentPhotoUri?: string | null;
    photoBlob?: Blob;
  }) {
    if (!user) return;
    try {
      await submitVerificationRequest({
        userId: user.id,
        applicantName: user.fullName,
        documentType: data.documentType,
        documentReference: data.documentReference,
        institutionClaimed: data.institutionClaimed,
        documentPhotoUri: data.documentPhotoUri,
        photoBlob: data.photoBlob,
      });
      markVerificationPending(user.id);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['campus-access'] });
      setApplyOpen(false);
      toast.success('Verification submitted. A campus moderator is reviewing it now.');
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Could not submit your verification. Please try again.'));
    }
  }

  const handleAction = onVerify ?? (user ? () => setApplyOpen(true) : undefined);

  const accent = reason === 'pending' ? colors.warning : colors.brandPrimary;
  const haloBg = isDark ? 'rgba(255,255,255,0.07)' : colors.pastelPrimaryBg;

  return (
    <>
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.body}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radius.glass,
          padding: spacing.xl,
          gap: spacing.md,
        },
      ]}
    >
      {teaser ? <View style={styles.teaser}>{teaser}</View> : null}

      <View style={[styles.halo, { backgroundColor: haloBg, borderRadius: radius.pill }]}>
        <Ionicons name={copy.icon} size={28} color={accent} />
      </View>

      <AppText variant="h3" weight="bold" style={styles.centered}>
        {copy.title}
      </AppText>

      <AppText tone="secondary" variant="bodySmall" style={[styles.centered, styles.body]}>
        {copy.body}
      </AppText>

      {copy.action && handleAction ? (
        <AppButton label={copy.action} variant="primary" onPress={handleAction} fullWidth />
      ) : null}

      <AppText tone="secondary" variant="caption" style={[styles.centered, styles.footnote]}>
        Global posts, events and resources stay open to you in the meantime.
      </AppText>
    </View>

    <ApplyForVerificationModal
      visible={applyOpen}
      onClose={() => setApplyOpen(false)}
      onSubmit={handleSubmit}
      defaultInstitution={campusName ?? undefined}
    />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1,
  },
  teaser: {
    width: '100%',
    alignItems: 'center',
  },
  halo: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
    width: '100%',
  },
  body: {
    lineHeight: 21,
  },
  footnote: {
    opacity: 0.85,
    lineHeight: 17,
  },
});
