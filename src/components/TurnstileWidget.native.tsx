import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppText } from '@/components/AppText';
import { captchaRequired } from '@/utils/captcha';

export interface TurnstileWidgetRef {
  reset: () => void;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  style?: any;
}

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAE8rvj6r5JOLLpDJ';
// Turnstile only issues tokens to hostnames registered for the site key. The WebView page is given the web app's
// origin so the same key that protects the website protects the phone apps.
const TURNSTILE_ORIGIN = process.env.EXPO_PUBLIC_SITE_URL || 'https://lioris-campus.vercel.app';

function buildHtml(theme: 'light' | 'dark'): string {
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
<style>html,body{margin:0;padding:0;background:transparent}body{display:flex;justify-content:center;align-items:center;min-height:70px}</style>
<script>
  var widgetId;
  function post(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  function onTurnstileLoad(){
    try {
      widgetId = turnstile.render('#c', {
        sitekey: ${JSON.stringify(TURNSTILE_SITE_KEY)},
        theme: ${JSON.stringify(theme)},
        callback: function(token){ post({type:'token', token: token}); },
        'expired-callback': function(){ post({type:'expired'}); },
        'error-callback': function(code){ post({type:'error', code: String(code || '')}); return true; }
      });
      post({type:'ready'});
    } catch (e) { post({type:'error', code: 'render'}); }
  }
  window.resetTurnstile = function(){ try { if (window.turnstile && widgetId !== undefined) turnstile.reset(widgetId); } catch (e) {} };
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script>
</head><body><div id="c"></div></body></html>`;
}

/** Phone version of the Cloudflare Turnstile check: the same widget the website shows, hosted in a WebView. */
export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(function TurnstileWidget(
  { onVerify, onExpire, onError, style },
  ref,
) {
  const { colors, isDark } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);

  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const html = useMemo(() => buildHtml(isDark ? 'dark' : 'light'), [isDark]);

  const reload = useCallback(() => {
    setVerified(false);
    setFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  }, []);

  useImperativeHandle(ref, () => ({
    reset: () => {
      setVerified(false);
      webViewRef.current?.injectJavaScript('window.resetTurnstile && window.resetTurnstile(); true;');
    },
  }));

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    let message: { type?: string; token?: string } | null = null;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    switch (message?.type) {
      case 'ready':
        setReady(true);
        break;
      case 'token':
        if (message.token) {
          setVerified(true);
          setFailed(false);
          onVerifyRef.current(message.token);
        }
        break;
      case 'expired':
        setVerified(false);
        onExpireRef.current?.();
        break;
      case 'error':
        setVerified(false);
        setFailed(true);
        onErrorRef.current?.();
        break;
    }
  }, []);

  if (!captchaRequired()) return null;

  return (
    <View style={[styles.container, style]}>
      <View style={{ width: 300, height: verified ? 0 : 75, overflow: 'hidden', opacity: verified ? 0 : 1 }}>
        <WebView
          key={`${attempt}:${isDark ? 'd' : 'l'}`}
          ref={webViewRef}
          source={{ html, baseUrl: TURNSTILE_ORIGIN }}
          originWhitelist={['https://*', 'about:*']}
          javaScriptEnabled
          domStorageEnabled
          onMessage={onMessage}
          onError={() => {
            setFailed(true);
            onErrorRef.current?.();
          }}
          onHttpError={() => setFailed(true)}
          onShouldStartLoadWithRequest={(req) =>
            req.url.startsWith('about:') || req.url.startsWith(TURNSTILE_ORIGIN) || /^https:\/\/([a-z0-9-]+\.)*cloudflare\.com\//i.test(req.url)
          }
          style={{ backgroundColor: 'transparent', width: 300, height: 75 }}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          accessibilityLabel="Security check"
        />
        {!ready && !failed ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : null}
      </View>
      {verified ? (
        <View style={styles.row}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <AppText variant="caption" style={{ color: colors.success, marginLeft: 4, fontWeight: '600' }}>
            Security verification complete
          </AppText>
        </View>
      ) : null}
      {failed ? (
        <Pressable onPress={reload} accessibilityRole="button" style={styles.row}>
          <Ionicons name="refresh-circle-outline" size={16} color={colors.critical} />
          <AppText variant="caption" style={{ color: colors.critical, marginLeft: 4 }}>
            The security check could not load. Tap to retry.
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', marginVertical: 12, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingVertical: 4, paddingHorizontal: 8 },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
