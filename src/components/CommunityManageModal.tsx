import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { AppText } from './AppText';
import { AppTextField } from './AppTextField';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { SolidCard } from './SolidCard';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import {
  ForumCommunityRecord,
  CommunityModerator,
  listCommunityModerators,
  addCommunityModerator,
  removeCommunityModerator,
  updateCommunityDetails,
} from '@/api/communities';
import { searchUsersToMessage, UserToMessage } from '@/api/messaging';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getFriendlyErrorMessage } from '@/utils/errors';
import { haptics } from '@/utils/haptics';

interface CommunityManageModalProps {
  visible: boolean;
  onClose: () => void;
  community: ForumCommunityRecord;
  /** Root admin can also remove the creator's own moderators; a plain creator can't remove themself, since they aren't a row in this table. */
  isAdmin: boolean;
}

/**
 * The "special view" a community's creator (or an admin) gets that nobody
 * else sees: edit the community's own details, and decide who else can help
 * pin/remove posts in it. Everything here is a no-op for anyone RLS doesn't
 * already grant forum_communities/forum_community_moderators access to -
 * this modal is only ever rendered for a creator or admin (see the gate in
 * CommunityFeedScreen), so that never comes up in practice.
 */
export function CommunityManageModal({ visible, onClose, community, isAdmin }: CommunityManageModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState(community.label);
  const [description, setDescription] = useState(community.description);
  const [rules, setRules] = useState<string[]>(community.rules);
  const [newRule, setNewRule] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [moderators, setModerators] = useState<CommunityModerator[]>([]);
  const [loadingModerators, setLoadingModerators] = useState(false);
  const [addModeratorOpen, setAddModeratorOpen] = useState(false);
  const [moderatorQuery, setModeratorQuery] = useState('');
  const debouncedModeratorQuery = useDebouncedValue(moderatorQuery);
  const [candidates, setCandidates] = useState<UserToMessage[]>([]);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLabel(community.label);
    setDescription(community.description);
    setRules(community.rules);
    setNewRule('');
    setAddModeratorOpen(false);
    setModeratorQuery('');
    refreshModerators();
  }, [visible, community.id]);

  useEffect(() => {
    if (!addModeratorOpen) return;
    let cancelled = false;
    setSearchingCandidates(true);
    searchUsersToMessage(debouncedModeratorQuery)
      .then((results) => {
        if (!cancelled) setCandidates(results.filter((r) => !moderators.some((m) => m.userId === r.id)));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setSearchingCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [addModeratorOpen, debouncedModeratorQuery, moderators]);

  async function refreshModerators() {
    setLoadingModerators(true);
    try {
      setModerators(await listCommunityModerators(community.id));
    } finally {
      setLoadingModerators(false);
    }
  }

  async function handleSaveDetails() {
    if (!label.trim() || !description.trim()) {
      Alert.alert('Missing details', 'Give the community a name and description first.');
      return;
    }
    haptics.light();
    setSavingDetails(true);
    try {
      await updateCommunityDetails(community.id, { label, description, rules });
      await queryClient.invalidateQueries({ queryKey: ['communities'] });
      haptics.success();
      Alert.alert('Saved', 'Community details updated.');
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not save', getFriendlyErrorMessage(err, 'Please try again.'));
    } finally {
      setSavingDetails(false);
    }
  }

  function handleAddRule() {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    setRules((prev) => [...prev, trimmed]);
    setNewRule('');
  }

  async function handleAddModerator(candidate: UserToMessage) {
    haptics.light();
    setAddingId(candidate.id);
    try {
      await addCommunityModerator(community.id, candidate.id);
      await refreshModerators();
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not add moderator', getFriendlyErrorMessage(err, 'Please try again.'));
    } finally {
      setAddingId(null);
    }
  }

  async function handleRemoveModerator(moderator: CommunityModerator) {
    haptics.light();
    setRemovingId(moderator.userId);
    try {
      await removeCommunityModerator(community.id, moderator.userId);
      setModerators((prev) => prev.filter((m) => m.userId !== moderator.userId));
    } catch (err: any) {
      haptics.error();
      Alert.alert('Could not remove moderator', getFriendlyErrorMessage(err, 'Please try again.'));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View accessibilityViewIsModal style={[styles.overlay, { padding: isDesktop ? spacing.lg : 0 }]}>
        <Pressable accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              maxHeight: isDesktop ? '88%' : '96%',
              borderRadius: isDesktop ? 24 : undefined,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.divider }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Ionicons name="shield-checkmark" size={20} color={community.accentColor} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="h3" weight="bold" numberOfLines={1}>
                  Manage {community.label}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  Only you{isAdmin ? " (as an admin)" : ''} and its moderators see this
                </AppText>
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <SolidCard radius={16} style={{ gap: spacing.sm }}>
              <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.5 }}>
                COMMUNITY DETAILS
              </AppText>
              <AppTextField label="Name" value={label} onChangeText={setLabel} maxLength={60} />
              <AppTextField
                label="Description"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                maxLength={280}
              />

              <AppText variant="bodySmall" weight="medium" tone="secondary" style={{ marginTop: spacing.xs }}>
                Rules
              </AppText>
              {rules.map((rule, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AppText variant="bodySmall" style={{ flex: 1 }}>
                    {idx + 1}. {rule}
                  </AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove rule ${idx + 1}`}
                    onPress={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <AppTextField
                    placeholder="Add a rule"
                    value={newRule}
                    onChangeText={setNewRule}
                    onSubmitEditing={handleAddRule}
                    style={{ marginBottom: 0 }}
                  />
                </View>
                <AppButton label="Add" variant="secondary" size="sm" onPress={handleAddRule} />
              </View>

              <AppButton label="Save Details" variant="primary" loading={savingDetails} onPress={handleSaveDetails} fullWidth />
            </SolidCard>

            <SolidCard radius={16} style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="caption" weight="bold" tone="secondary" style={{ letterSpacing: 0.5 }}>
                  MODERATORS
                </AppText>
                <Pressable onPress={() => setAddModeratorOpen((v) => !v)} hitSlop={8}>
                  <AppText variant="caption" weight="bold" tone="brand">
                    {addModeratorOpen ? 'Cancel' : '+ Add Moderator'}
                  </AppText>
                </Pressable>
              </View>

              {addModeratorOpen && (
                <View style={{ gap: 8 }}>
                  <AppTextField
                    placeholder="Search by name"
                    value={moderatorQuery}
                    onChangeText={setModeratorQuery}
                    style={{ marginBottom: 0 }}
                  />
                  {searchingCandidates ? (
                    <AppText variant="caption" tone="secondary">
                      Searching…
                    </AppText>
                  ) : (
                    candidates.slice(0, 8).map((candidate) => (
                      <Pressable
                        key={candidate.id}
                        onPress={() => handleAddModerator(candidate)}
                        disabled={addingId === candidate.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingVertical: 6,
                        }}
                      >
                        <Avatar name={candidate.fullName} uri={candidate.avatarUrl} size={32} />
                        <AppText variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>
                          {candidate.fullName}
                        </AppText>
                        <Ionicons
                          name={addingId === candidate.id ? 'hourglass-outline' : 'add-circle-outline'}
                          size={20}
                          color={colors.brandPrimary}
                        />
                      </Pressable>
                    ))
                  )}
                </View>
              )}

              {loadingModerators ? (
                <AppText variant="caption" tone="secondary">
                  Loading…
                </AppText>
              ) : moderators.length === 0 ? (
                <AppText variant="caption" tone="secondary">
                  Just you for now - add someone to help keep this space tidy.
                </AppText>
              ) : (
                moderators.map((moderator) => (
                  <View key={moderator.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <Avatar name={moderator.fullName} uri={moderator.avatarUrl} size={32} />
                    <AppText variant="bodySmall" style={{ flex: 1 }} numberOfLines={1}>
                      {moderator.fullName}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${moderator.fullName} as moderator`}
                      onPress={() => handleRemoveModerator(moderator)}
                      disabled={removingId === moderator.userId}
                      hitSlop={8}
                    >
                      <Ionicons name="remove-circle-outline" size={20} color={colors.critical} />
                    </Pressable>
                  </View>
                ))
              )}
            </SolidCard>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
});
