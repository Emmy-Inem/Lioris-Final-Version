import React, { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { LiorisLogo } from '@/components/LiorisLogo';

const NOT_FOUND_TITLE = 'Page not found | Lioris';

/**
 * Shown for every URL that matches no route (replaces expo-router's default "Unmatched Route" screen, which
 * lists every internal route, admin screens included, behind a "Sitemap" link). It deliberately does not echo
 * the requested URL back, links nowhere but home / sign-in, and asks search engines not to index it.
 *
 * "Go to home" goes to "/", which app/index.tsx already resolves for the signed-in user: their role dashboard,
 * or the onboarding / MFA step they still owe. Signed-out visitors land on the public landing page and also get
 * a "Sign in" button.
 */
export default function NotFoundScreen() {
  const { colors, spacing } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // The root layout's route-title hook runs after this effect in the same commit and would set the generic
    // default title for an unknown path, so apply ours on the next tick.
    const timer = setTimeout(() => {
      document.title = NOT_FOUND_TITLE;
    }, 0);

    // The site is one HTML file, so tell crawlers per page: a 404 screen is served with status 200.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);

    return () => {
      clearTimeout(timer);
      meta.remove();
    };
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, padding: spacing.lg }]} testID="not-found-screen">
      <View style={styles.card}>
        <LiorisLogo variant="full" size={44} />
        <View style={styles.iconWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="compass-outline" size={56} color={colors.textSecondary} />
        </View>
        <AppText variant="h1" weight="bold" role="heading" aria-level={1} style={styles.centered}>
          We can't find that page
        </AppText>
        <AppText tone="secondary" style={[styles.centered, styles.body]}>
          The link may be broken, or the page may have moved or been removed. Check the address, or head back to Lioris.
        </AppText>
        <View style={styles.actions}>
          <AppButton label="Go to home" icon="home-outline" onPress={() => router.replace('/')} />
          {!user && <AppButton label="Sign in" variant="secondary" onPress={() => router.replace('/(auth)/login' as any)} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    marginTop: 18,
  },
  centered: {
    textAlign: 'center',
  },
  body: {
    maxWidth: 360,
  },
  actions: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
});
