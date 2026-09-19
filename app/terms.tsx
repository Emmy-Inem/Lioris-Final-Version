import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';
import { LegalSection, LegalParagraph, LegalBullets, LegalStrong, LegalPlaceholder } from '@/components/LegalSection';
import { DATA_CONTROLLER, DPO_EMAIL, MIN_AGE, MIN_AGE_WITH_CONSENT, RETENTION, TERMS_VERSION } from '@/constants/legal';

export default function TermsOfServiceScreen() {
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
            <LiorisLogo size={20} variant="wordmark" />
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
                TERMS & CONDITIONS
              </AppText>
              <AppText
                variant="h1"
                weight="bold"
                style={{ fontSize: isDesktop ? 36 : 28, marginTop: 6, color: isDark ? '#FFF' : '#0F172A' }}
              >
                Terms of Service
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                Version {TERMS_VERSION} • {DATA_CONTROLLER.legalName}
              </AppText>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

            <LegalSection title="1. Acceptance of Terms & Eligibility">
              <LegalParagraph>
                By creating an account or using Lioris you agree to these Terms of Service, the Privacy Policy and the
                Community Rules. You must be at least {MIN_AGE} years old, or an admitted university student aged {MIN_AGE_WITH_CONSENT}–17
                registering with parental or guardian consent. Access to institutional spaces requires active affiliation
                (as an enrolled student, staff member, or verified alumnus) verified via institutional domain email or accredited
                registrar documents. Other users may join the general network and apply for verification afterwards.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="2. Your Account & Security">
              <LegalParagraph>
                You are responsible for keeping your password and authenticator device secure and for activity on your
                account. Provide accurate information, do not share or sell your account, and tell us promptly if you
                suspect unauthorised access. Administrator and staff accounts must use two-factor authentication.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="3. Acceptable Use & Academic Integrity">
              <LegalParagraph>
                Lioris is dedicated to constructive peer learning, academic resource sharing, and professional growth.
                You must not:
              </LegalParagraph>
              <LegalBullets
                items={[
                  'Upload active, unreleased examination questions or engage in academic dishonesty.',
                  'Impersonate other students, faculty members, administrative staff or institutions.',
                  'Harass, threaten or discriminate against others, share hate speech, or publish other people\'s personal information without permission.',
                  'Post unlawful content, including child sexual abuse material, which is reported to the authorities.',
                  'Use bots, scrapers or other automated means to collect data from Lioris, or to create accounts, post or message at scale.',
                  'Attempt to probe, disrupt or bypass security, rate limits or access controls.',
                ]}
              />
            </LegalSection>

            <LegalSection title="4. Your Content & Licence">
              <LegalParagraph>
                You retain all rights to the forum discussions, study notes and other content you post. You grant Lioris
                a non-exclusive, worldwide, royalty-free licence to host, store, reproduce and display that content
                solely to operate and provide the service to the audience you choose (for example your institution's
                verified directory), and to keep the platform safe. This licence ends when you delete the content or
                your account, except for copies that cannot yet be removed from backups (see the Privacy Policy). You
                confirm that you own or have the right to share what you upload.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="5. AI Study Copilot">
              <LegalParagraph>
                The AI Study Copilot uses Google Gemini to generate responses. Output may be inaccurate, incomplete or
                out of date and is provided for study support only; it is not professional (legal, medical, financial or
                academic-advisory) advice and you should verify it before relying on it. Do not submit other people's
                personal data, confidential material or anything you do not have the right to share. Prompts and images
                you submit are sent to Google for processing as described in the Privacy Policy. Do not use the Copilot
                to cheat in assessments or to generate unlawful content.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="6. Marketplace & Escrow">
              <LegalParagraph>
                The campus marketplace lets users list and buy items and services. Lioris is a platform only and is not
                a party to sales between users, does not own or inspect listed goods, and does not guarantee quality,
                legality or delivery. Any escrow or hold feature is a convenience mechanism whose release is governed by
                the rules shown in the app. Buyers and sellers must comply with applicable law (including consumer
                protection and tax rules) and may not list prohibited or stolen items. Meet in safe public campus
                locations and report suspicious listings.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="7. Moderation & Suspension">
              <LegalParagraph>
                We and campus moderators may remove content, restrict features, or suspend or terminate accounts that
                breach these Terms or the Community Rules, or where required by law. Where practicable we will tell you
                why and how to appeal (see Community Rules for the moderation contact).
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="8. Termination & Deletion">
              <LegalParagraph>
                You may stop using Lioris and delete your account at any time from Settings, then Privacy & Data.
                Deletion permanently erases your account, content, messages, uploads and verification documents and
                cannot be undone; backups roll off within {RETENTION.backupRollOffDays} days. We may suspend or
                terminate your access for serious or repeated breaches.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="9. Disclaimers & Limitation of Liability">
              <LegalParagraph>
                Lioris is provided "as is" and "as available". To the fullest extent permitted by applicable law, Lioris and
                its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages, or any loss of profits, revenue, data, use, goodwill, or other intangible
                losses. In no event shall our aggregate liability exceed the greater of fifty thousand Nigerian Naira (NGN 50,000)
                or the total amount paid by you to Lioris in the twelve (12) months preceding the claim. Nothing in these Terms
                excludes or limits any liability that cannot be excluded under the laws of the Federal Republic of Nigeria.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="10. Governing Law & Dispute Resolution">
              <LegalParagraph>
                These Terms and any dispute arising from or related to them or your use of the platform shall be governed by
                and construed in accordance with the laws of the Federal Republic of Nigeria. Any dispute, controversy, or claim
                that cannot be resolved amicably shall be submitted to the exclusive jurisdiction of the state and federal courts
                situated in Nigeria, without affecting any mandatory statutory consumer protections that cannot be waived.
                Terms version: <LegalStrong>{TERMS_VERSION}</LegalStrong>.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="11. Direct Administration & Inquiries">
              <LegalParagraph>
                For questions regarding governance, moderation appeals, or institutional partnerships:
                {'\n\n'}
                <LegalStrong>Campus Platform Administration</LegalStrong>
                {'\n'}Support Email: {DATA_CONTROLLER.contactEmail}
                {'\n'}Privacy & Legal Inquiries: {DPO_EMAIL}
              </LegalParagraph>
            </LegalSection>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
