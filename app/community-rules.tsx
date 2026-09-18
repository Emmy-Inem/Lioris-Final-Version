import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';

export default function CommunityRulesScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { isDesktop } = useResponsive();
  const { getGlassBorderColor, getBackdropFilterString } = useLiquidGlass();

  const glassStyle = (customRadius = 24, customAlpha?: number) => {
    const alpha = customAlpha ?? (isDark ? 0.45 : 0.65);
    return [
      {
        borderRadius: customRadius,
        borderColor: getGlassBorderColor(isDark),
        borderWidth: 1,
        backgroundColor: isDark
          ? `rgba(15, 23, 42, ${alpha})`
          : `rgba(255, 255, 255, ${alpha})`,
        overflow: 'hidden' as const,
        position: 'relative' as const,
      },
      Platform.OS === 'web' &&
        ({
          backdropFilter: getBackdropFilterString(),
          WebkitBackdropFilter: getBackdropFilterString(),
          boxShadow: isDark
            ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 12px 36px -4px rgba(0, 0, 0, 0.45)'
            : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.85), 0 12px 36px -4px rgba(15, 23, 42, 0.07)',
        } as any),
    ];
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#080E1A' : '#F6F8FB' }}>
      {/* Top Header */}
      <View
        style={{
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
          top: Platform.OS === 'web' ? 16 : 40,
          left: 0,
          right: 0,
          zIndex: 999,
          alignItems: 'center',
          paddingHorizontal: 16,
        }}
      >
        <View
          style={[
            glassStyle(999, isDark ? 0.75 : 0.85),
            {
              width: '100%',
              maxWidth: 1000,
              paddingVertical: 12,
              paddingHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            },
          ]}
        >
          <Pressable onPress={() => router.push('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <LiorisLogo size={30} variant="symbol" />
            <LiorisLogo size={20} variant="wordmark" tintColor={isDark ? '#FFFFFF' : colors.textPrimary} />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={toggleTheme}
              accessibilityLabel="Toggle Theme"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={17} color={isDark ? '#F8FAFC' : '#1E293B'} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              }}
            >
              <Ionicons name="arrow-back" size={15} color={isDark ? '#FFF' : '#0F172A'} />
              <AppText variant="bodySmall" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                Back to Home
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: Platform.OS === 'web' ? 100 : 110,
          paddingBottom: 60,
          paddingHorizontal: 16,
        }}
      >
        <View style={{ width: '100%', maxWidth: 860, alignSelf: 'center' }}>
          <View style={[glassStyle(28, isDark ? 0.55 : 0.75), { padding: isDesktop ? 40 : 24, gap: 24 }]}>
            <View>
              <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 1.2 }}>
                STANDARDS & ETHICS
              </AppText>
              <AppText
                variant="h1"
                weight="bold"
                style={{ fontSize: isDesktop ? 36 : 28, marginTop: 6, color: isDark ? '#FFF' : '#0F172A' }}
              >
                Community Guidelines
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                Last updated: September 2026 • Lioris Campus Technologies
              </AppText>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

            <View style={{ gap: 12 }}>
              <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                1. Respectful Academic Discourse
              </AppText>
              <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
                Lioris is a scholarly environment. While spirited debate and diverse viewpoints are welcomed,
                personal attacks, derogatory slurs, tribal discrimination, and religious hostility are strictly
                prohibited across all public forums and group chats.
              </AppText>
            </View>

            <View style={{ gap: 12 }}>
              <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                2. Academic Honor Code
              </AppText>
              <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
                Sharing past examination papers, syllabus summaries, and tutorial explanations is encouraged.
                However, publishing active examination questions, circulating stolen marking schemes, or soliciting
                impersonation in university assessments constitutes a severe violation resulting in immediate account termination.
              </AppText>
            </View>

            <View style={{ gap: 12 }}>
              <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                3. Mentorship & Professional Etiquette
              </AppText>
              <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
                Alumni volunteer their time to guide current undergraduates. Students are expected to maintain
                punctuality, professionalism, and courteous communication during 1-on-1 mentorship sessions.
              </AppText>
            </View>

            <View style={{ gap: 12 }}>
              <AppText variant="h3" weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>
                4. Reporting Violations & Direct Contact
              </AppText>
              <AppText variant="body" tone="secondary" style={{ lineHeight: 24 }}>
                To report a community violation or appeal a moderation decision:
                {'\n\n'}
                <AppText weight="bold" style={{ color: isDark ? '#FFF' : '#0F172A' }}>Community Moderation Desk</AppText>
                {'\n'}Email: inememmanuel@gmail.com
                {'\n'}Telephone: +2349076664049
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
