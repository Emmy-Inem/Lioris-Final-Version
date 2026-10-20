import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Alert, AlertButton, AlertOptions, Modal, Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { ensureContrast } from '@/theme/contrast';
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
  options?: AlertOptions;
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

function dequeue(id: number) {
  // Ignore a second dismissal of the same alert (e.g. Escape pressed twice) so it can't
  // pop the next queued alert unseen.
  if (queue[0]?.id !== id) return;
  queue = queue.slice(1);
  notify();
}

function pressButton(request: AlertRequest, button: AlertButton) {
  if (queue[0]?.id !== request.id) return;
  dequeue(request.id);
  button.onPress?.();
}

/**
 * Escape / backdrop tap. Runs the cancel-style button when there is one; a lone
 * non-destructive button (an "OK" notice) counts as its own dismissal. Otherwise the alert is
 * just closed, unless every button is destructive - then the person has to choose explicitly.
 * `cancelable: false` opts an alert out of being dismissed this way.
 */
function dismissRequest(request: AlertRequest) {
  if (request.options?.cancelable === false) return;
  const cancel = request.buttons.find((b) => b.style === 'cancel');
  if (cancel) return pressButton(request, cancel);
  if (request.buttons.length === 1 && request.buttons[0].style !== 'destructive') {
    return pressButton(request, request.buttons[0]);
  }
  if (request.buttons.every((b) => b.style === 'destructive')) return;
  if (queue[0]?.id !== request.id) return;
  dequeue(request.id);
  request.options?.onDismiss?.();
}

// The element that had focus when the first alert of a burst opened, so focus can go back to it.
let openerElement: any = null;

function getDocument(): any {
  return (globalThis as any).document;
}

export function installWebAlertPolyfill() {
  if (Platform.OS !== 'web') return;

  Alert.alert = (title, message, buttons, options) => {
    const normalizedButtons: AlertButton[] = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    if (queue.length === 0) {
      const doc = getDocument();
      const active = doc?.activeElement;
      openerElement = active && active !== doc.body ? active : null;
    }
    queue = [...queue, { id: nextId++, title: title || '', message, buttons: normalizedButtons, options }];
    notify();
  };
}

const FOCUSABLE_SELECTOR = '[tabindex="0"], button, a[href], input, select, textarea';

export function AlertHost() {
  const { colors, spacing, radius, isDark } = useTheme();
  const currentQueue = useSyncExternalStore(subscribe, getQueue, getQueue);
  const request = currentQueue[0];
  const isOpen = request != null;
  const requestId = request?.id;
  const dialogRef = useRef<View>(null);
  const buttonRefs = useRef<Array<View | null>>([]);

  // Give focus back to whatever opened the alert once the last alert is gone.
  useEffect(() => {
    if (!isOpen) return;
    return () => {
      const target = openerElement;
      openerElement = null;
      setTimeout(() => {
        const doc = getDocument();
        if (target && doc?.contains?.(target)) target.focus?.();
      }, 0);
    };
  }, [isOpen]);

  // Move focus into the dialog: the first non-destructive button (so Enter never confirms a
  // destructive action by accident), else the first button.
  useEffect(() => {
    if (requestId == null) return;
    const timer = setTimeout(() => {
      const buttons = queue[0]?.buttons ?? [];
      const preferred = buttons.findIndex((b) => b.style !== 'destructive');
      (buttonRefs.current[preferred >= 0 ? preferred : 0] as any)?.focus?.();
    }, 0);
    return () => clearTimeout(timer);
  }, [requestId]);

  // Keep Tab / Shift+Tab inside the dialog.
  useEffect(() => {
    const doc = getDocument();
    if (!isOpen || !doc?.addEventListener) return;
    const onKeyDown = (e: any) => {
      if (e.key !== 'Tab') return;
      const node = dialogRef.current as any;
      if (!node?.querySelectorAll) return;
      const focusables: any[] = Array.from(node.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = doc.activeElement;
      if (!node.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  if (!request) return null;

  const titleId = `lioris-alert-title-${request.id}`;
  const messageId = `lioris-alert-message-${request.id}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismissRequest(request)}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        {/* Backdrop: a tap outside the dialog dismisses it. Kept out of the tab order and the
            accessibility tree; Escape is the keyboard equivalent. */}
        <Pressable
          accessible={false}
          focusable={false}
          importantForAccessibility="no"
          onPress={() => dismissRequest(request)}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <View
          ref={dialogRef}
          role="alertdialog"
          aria-modal
          aria-labelledby={titleId}
          aria-describedby={request.message ? messageId : undefined}
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
          <AppText
            nativeID={titleId}
            variant="h2"
            weight="bold"
            style={{ marginBottom: request.message ? spacing.xs : spacing.lg }}
          >
            {request.title}
          </AppText>
          {request.message ? (
            <AppText nativeID={messageId} tone="secondary" variant="bodySmall" style={{ marginBottom: spacing.lg }}>
              {request.message}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' }}>
            {request.buttons.map((button, index) => (
              <Pressable
                key={`${button.text}-${index}`}
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                accessibilityRole="button"
                accessibilityLabel={button.text || 'OK'}
                onPress={() => pressButton(request, button)}
                style={{
                  minHeight: 44,
                  minWidth: 64,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: spacing.md,
                  paddingVertical: 10,
                  borderRadius: radius.md,
                }}
              >
                <AppText
                  weight="bold"
                  variant="bodySmall"
                  style={{
                    color:
                      button.style === 'destructive'
                        ? ensureContrast(colors.critical, colors.background)
                        : button.style === 'cancel'
                        ? colors.textSecondary
                        : ensureContrast(colors.brandPrimary, colors.background),
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
