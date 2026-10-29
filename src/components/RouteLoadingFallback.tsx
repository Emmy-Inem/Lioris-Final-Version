import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

/**
 * Shown on web while a route's code chunk is downloading (see metro.config.js, which swaps it in for expo-router's
 * stock `null` fallback). Deliberately dependency-free (no theme provider, no components) because it is part of the
 * first-load bundle and can render before the app's providers exist. It waits a moment before showing the spinner so
 * a chunk that is already cached never flashes one.
 *
 * Must accept (and ignore) the `route` / `params` props expo-router passes to a SuspenseFallback.
 */
export function SuspenseFallback(_props: { route?: string; params?: unknown }) {
  const dark = useColorScheme() === 'dark';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: dark ? '#0A1326' : '#F8FAF9' }]} testID="route-loading-fallback">
      {visible ? (
        <ActivityIndicator size="large" color={dark ? '#6A89FF' : '#1A3DFF'} accessibilityLabel="Loading page" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
