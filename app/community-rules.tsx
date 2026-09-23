import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';
import { LegalSection, LegalParagraph, LegalStrong } from '@/components/LegalSection';
import { DATA_CONTROLLER, TERMS_VERSION } from '@/constants/legal';

export default function CommunityRulesScreen() {
  const { isDark, toggleTheme } = useTheme();
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
          <Pressable accessibilityRole="button" accessibilityLabel="Lioris home" onPress={() => router.push('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <LiorisLogo size={30} variant="symbol" />
            <LiorisLogo size={20} variant="wordmark" />
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={toggleTheme}
              accessibilityRole="button"
              accessibilityLabel="Toggle Theme"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={17} color={isDark ? '#F8FAFC' : '#1E293B'} />
            </Pressable>

            <Pressable
              onPress={() => router.push('/')}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                minHeight: 44,
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
        accessibilityLabel="Community rules content"
        focusable={Platform.OS === 'web'}
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
                Version {TERMS_VERSION} • {DATA_CONTROLLER.legalName}
              </AppText>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

            <LegalSection title="1. Respectful Academic Discourse">
              <LegalParagraph>
                Lioris is a scholarly environment. While spirited debate and diverse viewpoints are welcomed,
                personal attacks, derogatory slurs, tribal discrimination, and religious hostility are strictly
                prohibited across all public forums and group chats.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="2. Zero Tolerance">
              <LegalParagraph>
                We have no tolerance for harassment, bullying, threats, sexual exploitation, and any content that
                sexualises minors (child sexual abuse material). Illegal content, including incitement to violence,
                fraud, and trade in prohibited goods, is removed immediately, accounts involved are terminated, and
                serious cases are referred to the appropriate law enforcement authorities.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="3. Academic Honor Code">
              <LegalParagraph>
                Sharing past examination papers, syllabus summaries, and tutorial explanations is encouraged.
                However, publishing active examination questions, circulating stolen marking schemes, or soliciting
                impersonation in university assessments constitutes a severe violation resulting in immediate account termination.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="4. Mentorship & Professional Etiquette">
              <LegalParagraph>
                Alumni volunteer their time to guide current undergraduates. Students are expected to maintain
                punctuality, professionalism, and courteous communication during 1-on-1 mentorship sessions.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="5. Report and Block">
              <LegalParagraph>
                You are in control of your experience. Use the report option on any post, comment, message, listing or
                profile to flag a violation, and use block to stop a person from contacting you or appearing in your
                feeds. Reports are reviewed by campus moderators and administrators, and reporters are not disclosed to
                the reported user. Deliberately false reports may themselves lead to sanctions.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="6. Reaching Moderators & Appeals">
              <LegalParagraph>
                To report a community violation, escalate an urgent safety concern, or appeal a moderation decision,
                use the in-app report or Support Desk (Settings) or contact us directly:
                {'\n\n'}
                <LegalStrong>Community Moderation Desk</LegalStrong>
                {'\n'}Email: {DATA_CONTROLLER.contactEmail}
                {'\n'}Telephone: {DATA_CONTROLLER.contactPhone}
                {'\n\n'}
                Consequences range from content removal and warnings to suspension and permanent account termination.
              </LegalParagraph>
            </LegalSection>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
