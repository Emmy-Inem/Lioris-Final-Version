import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Android map for the Campus Map modal: the same OpenStreetMap embed the web version shows in an
 * iframe, hosted in a WebView. Only openstreetmap.org is allowed to load inside it.
 */
export function AndroidCampusMap({ embedUrl }: { embedUrl: string }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.textSecondary} />
        <AppText variant="caption" tone="secondary" style={{ marginTop: 6 }}>
          Map unavailable offline. Use Directions to open it in your maps app.
        </AppText>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        // Reload when the selected landmark changes.
        key={embedUrl}
        source={{ uri: embedUrl }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        originWhitelist={['https://www.openstreetmap.org*', 'https://*.openstreetmap.org*']}
        onShouldStartLoadWithRequest={(req) => /^https:\/\/([a-z0-9-]+\.)?openstreetmap\.org(\/|$)/i.test(req.url)}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
      />
      {loading ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
});
