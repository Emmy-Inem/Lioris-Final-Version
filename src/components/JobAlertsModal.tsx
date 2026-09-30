import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { useTheme } from '@/theme/ThemeProvider';
import { listMyJobAlerts, createJobAlert, deleteJobAlert, setJobAlertActive, JobAlert } from '@/api/jobAlerts';
import { haptics } from '@/utils/haptics';

const JOB_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract'] as const;

function describeAlert(a: JobAlert): string {
  const parts: string[] = [];
  if (a.keywords) parts.push(`"${a.keywords}"`);
  if (a.jobType) parts.push(a.jobType);
  if (a.remoteOnly) parts.push('Remote only');
  if (a.campusCode) parts.push(a.campusCode);
  return parts.length > 0 ? parts.join(' · ') : 'Any new job posting';
}

export function JobAlertsModal({ visible, onClose, initialKeywords }: { visible: boolean; onClose: () => void; initialKeywords?: string }) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState('');
  const [jobType, setJobType] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setKeywords(initialKeywords || '');
    refresh();
  }, [visible, initialKeywords]);

  function refresh() {
    setLoading(true);
    listMyJobAlerts()
      .then(setAlerts)
      .finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (creating) return;
    haptics.light();
    setCreating(true);
    try {
      await createJobAlert({ keywords: keywords.trim() || undefined, jobType: jobType || undefined, remoteOnly });
      setKeywords('');
      setJobType(null);
      setRemoteOnly(false);
      refresh();
    } catch (err: any) {
      Alert.alert('Could Not Create Alert', err?.message || 'Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(alert: JobAlert, next: boolean) {
    haptics.light();
    setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, isActive: next } : a)));
    try {
      await setJobAlertActive(alert.id, next);
    } catch {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, isActive: !next } : a)));
    }
  }

  function handleDelete(alert: JobAlert) {
    Alert.alert('Delete This Alert?', describeAlert(alert), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
          try {
            await deleteJobAlert(alert.id);
          } catch {
            refresh();
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        accessibilityViewIsModal
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.md, paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: spacing.lg,
            width: '100%',
            maxWidth: 520,
            maxHeight: '88%',
            gap: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <AppText variant="h3" weight="bold">
                Job Alerts
              </AppText>
              <AppText tone="secondary" variant="caption">
                Get notified when a matching job goes live
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            <View style={{ gap: spacing.sm, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
              <AppText weight="bold" variant="bodySmall">
                New Alert
              </AppText>
              <TextInput
                value={keywords}
                onChangeText={setKeywords}
                placeholder="Keywords (e.g. frontend, data analyst)"
                placeholderTextColor={colors.textSecondary}
                style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 8, color: colors.textPrimary, fontSize: 13 }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {JOB_TYPES.map((t) => {
                  const selected = jobType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setJobType(selected ? null : t)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: radius.pill,
                        backgroundColor: selected ? colors.brandPrimary : colors.surface,
                        borderWidth: 1,
                        borderColor: selected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <AppText variant="caption" weight="bold" style={{ color: selected ? '#FFFFFF' : colors.textPrimary, fontSize: 11 }}>
                        {t}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="bodySmall">Remote only</AppText>
                <Switch value={remoteOnly} onValueChange={setRemoteOnly} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
              </View>
              <AppButton label={creating ? 'Creating…' : 'Create Alert'} onPress={handleCreate} loading={creating} />
            </View>

            <View style={{ gap: spacing.sm }}>
              <AppText weight="bold" variant="bodySmall">
                Your Alerts ({alerts.length})
              </AppText>
              {loading ? (
                <AppText tone="secondary" variant="caption">
                  Loading…
                </AppText>
              ) : alerts.length === 0 ? (
                <AppText tone="secondary" variant="caption">
                  No alerts yet - create one above.
                </AppText>
              ) : (
                alerts.map((a) => (
                  <View
                    key={a.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                      backgroundColor: colors.background,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: spacing.sm,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodySmall" weight="medium" numberOfLines={2}>
                        {describeAlert(a)}
                      </AppText>
                      <AppText variant="caption" tone="secondary">
                        {a.lastNotifiedAt ? `Last matched ${new Date(a.lastNotifiedAt).toLocaleDateString()}` : 'No matches yet'}
                      </AppText>
                    </View>
                    <Switch value={a.isActive} onValueChange={(v) => handleToggleActive(a, v)} trackColor={{ false: colors.divider, true: colors.brandPrimary }} />
                    <Pressable onPress={() => handleDelete(a)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.critical} />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
