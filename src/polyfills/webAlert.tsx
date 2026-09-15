import React, { useSyncExternalStore } from 'react';
import { Alert, AlertButton, Modal, Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * react-native-web's Alert.alert is a no-op stub (`static alert() {}`) - it
 * never renders anything, so every Alert.alert() call across the app
 * (confirmations, destructive-action gates, success/error messages) is
 * silently inert on web. Patching Alert.alert once here - instead of
 * touching every one of its ~200 call sites - makes it draw a real modal on
 * web while leaving native iOS/Android behavior untouched.
 */

interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

let queue: AlertRequest[] = [];
let nextId = 1;
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getQueue() {
  return queue;
}

function dequeue() {
  queue = queue.slice(1);
  notify();
}

export function installWebAlertPolyfill() {
  if (Platform.OS !== 'web') return;

  Alert.alert = (title, message, buttons) => {
    const normalizedButtons: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    queue = [...queue, { id: nextId++, title: title || '', message, buttons: normalizedButtons }];
    notify();
  };
}

export function AlertHost() {
  const { colors, spacing, radius, isDark } = useTheme();
  const currentQueue = useSyncExternalStore(subscribe, getQueue, getQueue);
  const request = currentQueue[0];

  if (!request) return null;

  function handlePress(button: AlertButton) {
    dequeue();
    button.onPress?.();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.background,
            borderRadius: radius.lg,
            padding: spacing.lg,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
          }}
        >
          <AppText variant="h2" weight="bold" style={{ marginBottom: request.message ? spacing.xs : spacing.lg }}>
            {request.title}
          </AppText>
          {request.message ? (
            <AppText tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.lg }}>
              {request.message}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' }}>
            {request.buttons.map((button, index) => (
              <Pressable
                key={`${button.text}-${index}`}
                onPress={() => handlePress(button)}
                style={{ paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md }}
              >
                <AppText
                  weight="bold"
                  variant="bodySmall"
                  style={{
                    color:
                      button.style === 'destructive'
                        ? colors.critical
                        : button.style === 'cancel'
                        ? colors.textSecondary
                        : colors.brandPrimary,
                  }}
                >
                  {button.text || 'OK'}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
