import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';
import { isValidEmailFormat } from '@/utils/validation';
import { Resource } from '@/api/types';
import { submitTakedownRequest, TAKEDOWN_CLAIM_OPTIONS, TakedownClaimType } from '@/api/takedown';
import { router } from 'expo-router';

interface ReportResourceFormProps {
  resource: Resource;
  onClose: () => void;
  onSubmitted?: (result: { autoHidden: boolean }) => void;
}

/**
 * "Report / request removal" form for a shared resource. Used inside a Modal (from a resource
 * card) or as an in-place overlay (from the reader, which is itself a Modal - nesting native
 * modals misbehaves on phones).
 */
export function ReportResourceForm({ resource, onClose, onSubmitted }: ReportResourceFormProps) {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [claimType, setClaimType] = useState<TakedownClaimType>('owner_removal');
  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState('');
  const [details, setDetails] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName((prev) => prev || user?.fullName || '');
    setEmail((prev) => prev || user?.email || '');
  }, [user?.fullName, user?.email]);

  const option = TAKEDOWN_CLAIM_OPTIONS.find((o) => o.type === claimType)!;
  const needsRole = claimType === 'owner_removal' || claimType === 'agent_removal';

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 2) return setError('Please enter your full name.');
    if (!isValidEmailFormat(email.trim())) return setError('Please enter a valid email address we can reach you on.');
    if (details.trim().length < 10) return setError('Please add a few details (at least 10 characters).');
    if (option.isCopyrightClaim && !confirmed) return setError('Please tick the confirmation before sending.');

    haptics.medium();
    setSubmitting(true);
    try {
      const result = await submitTakedownRequest({
        resourceId: resource.id,
        claimType,
        claimantName: name,
        claimantEmail: email,
        claimantRole: role,
        details,
        goodFaith: option.isCopyrightClaim ? confirmed : false,
      });
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
      toast.success(
        result.autoHidden
          ? 'Request received. The resource has been taken offline while we review it.'
          : 'Report received. Our team will review it.',
      );
      onSubmitted?.({ autoHidden: result.autoHidden });
      onClose();
    } catch (err: any) {
      haptics.error();
      // submitTakedownRequest throws readable messages (validation, rate limit, duplicate request).
      setError(err?.message || 'Could not send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="h3" weight="bold">
            Report or request removal
          </AppText>
          <AppText tone="secondary" variant="caption" numberOfLines={2} style={{ marginTop: 2 }}>
            {resource.title}
            {resource.courseCode ? ` · ${resource.courseCode}` : ''}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={10}
          style={{ padding: 4 }}
        >
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={{ gap: spacing.xs }}>
        {TAKEDOWN_CLAIM_OPTIONS.map((opt) => {
          const selected = opt.type === claimType;
          return (
            <Pressable
              key={opt.type}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                haptics.light();
                setClaimType(opt.type);
                setConfirmed(false);
                setError(null);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: spacing.sm,
                padding: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderColor: selected ? colors.brandPrimary : colors.border,
                backgroundColor: selected ? colors.pastelPrimaryBg : 'transparent',
              }}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? colors.brandPrimary : colors.textSecondary}
                style={{ marginTop: 1 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText weight="bold" variant="bodySmall">
                  {opt.title}
                </AppText>
                <AppText tone="secondary" variant="caption" style={{ marginTop: 1 }}>
                  {opt.description}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {option.hidesImmediately ? (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            padding: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.divider,
          }}
        >
          <Ionicons name="flash-outline" size={18} color={colors.brandPrimary} style={{ marginTop: 1 }} />
          <AppText variant="caption" style={{ flex: 1 }}>
            The resource is taken offline as soon as you send this, while an administrator reviews it. Your name and
            email are kept as our record of the request and are never shown to the person who shared the file.
          </AppText>
        </View>
      ) : null}

      <AppTextField label="Your full name" value={name} onChangeText={setName} autoCapitalize="words" />
      <AppTextField
        label="Contact email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {needsRole ? (
        <AppTextField
          label={claimType === 'owner_removal' ? 'Your role (e.g. Lecturer, Dept. of Chemistry)' : 'Who you act for, and your role'}
          value={role}
          onChangeText={setRole}
        />
      ) : null}
      <AppTextField
        label={
          option.isCopyrightClaim
            ? 'Which material, and what do you own or represent?'
            : 'What is wrong with it?'
        }
        value={details}
        onChangeText={setDetails}
        multiline
        numberOfLines={4}
        placeholder={
          option.isCopyrightClaim
            ? 'e.g. These are my CHM 201 lecture slides; I have not given permission for them to be shared.'
            : 'Tell us what we should look at.'
        }
      />

      {option.isCopyrightClaim ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => {
            haptics.light();
            setConfirmed((v) => !v);
          }}
          style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
        >
          <Ionicons
            name={confirmed ? 'checkbox' : 'square-outline'}
            size={22}
            color={confirmed ? colors.brandPrimary : colors.textSecondary}
          />
          <AppText variant="caption" style={{ flex: 1, lineHeight: 17 }}>
            {claimType === 'third_party_copyright'
              ? 'I believe in good faith that this material is being shared without the permission of its copyright owner, and the information I have given is accurate.'
              : 'I confirm in good faith that I am the copyright owner (or authorised to act for the owner) of this material, that it is shared here without permission, and that the information in this request is accurate. I understand that a knowingly false claim may have legal consequences.'}
          </AppText>
        </Pressable>
      ) : null}

      {error ? (
        <AppText variant="caption" tone="critical" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <AppButton
        label={option.hidesImmediately ? 'Take it offline & send request' : 'Send report'}
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        fullWidth
      />

      <Pressable
        accessibilityRole="link"
        onPress={() => {
          onClose();
          router.push('/copyright' as any);
        }}
        style={{ alignSelf: 'center', paddingVertical: 4 }}
      >
        <AppText variant="caption" tone="brand" weight="semiBold">
          Read the Copyright & Takedown Policy
        </AppText>
      </Pressable>
    </View>
  );
}

interface ReportResourceModalProps {
  visible: boolean;
  resource: Resource | null;
  onClose: () => void;
  onSubmitted?: (result: { autoHidden: boolean }) => void;
}

export function ReportResourceModal({ visible, resource, onClose, onSubmitted }: ReportResourceModalProps) {
  const { colors, spacing } = useTheme();
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  if (!resource) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: isDesktop ? 'center' : 'flex-end',
          alignItems: 'center',
        }}
      >
        <Pressable accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <View
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '92%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomLeftRadius: isDesktop ? 24 : 0,
            borderBottomRightRadius: isDesktop ? 24 : 0,
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) }}
          >
            <ReportResourceForm resource={resource} onClose={onClose} onSubmitted={onSubmitted} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
