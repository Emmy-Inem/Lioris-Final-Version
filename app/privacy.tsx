import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { LiorisLogo } from '@/components/LiorisLogo';
import { AppText } from '@/components/AppText';
import { LegalSection, LegalParagraph, LegalBullets, LegalStrong } from '@/components/LegalSection';
import { BREACH_NOTIFICATION_HOURS, DATA_CONTROLLER, DSR_RESPONSE_DAYS, HOSTING_REGIONS, INDEPENDENT_AGE, MIN_AGE, NDPC, PRIVACY_VERSION, RETENTION } from '@/constants/legal';

export default function PrivacyPolicyScreen() {
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
        accessibilityLabel="Privacy policy content"
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
                LEGAL & COMPLIANCE
              </AppText>
              <AppText
                variant="h1"
                weight="bold"
                style={{ fontSize: isDesktop ? 36 : 28, marginTop: 6, color: isDark ? '#FFF' : '#0F172A' }}
              >
                Privacy Policy
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                Version {PRIVACY_VERSION} • {DATA_CONTROLLER.legalName}
              </AppText>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

            <LegalSection title="1. Who We Are (Data Controller)">
              <LegalParagraph>
                This notice explains how personal data is processed when you use Lioris, a campus network for verified
                university students, staff and alumni. It is written to meet the Nigeria Data Protection Act 2023
                (NDPA) and, for users in the European Union or United Kingdom, the GDPR / UK GDPR.
              </LegalParagraph>
              <LegalBullets
                items={[
                  <><LegalStrong>Service and data controller:</LegalStrong> {DATA_CONTROLLER.legalName} ({DATA_CONTROLLER.name}, “we”, “us”)</>,
                  <><LegalStrong>Privacy and data requests:</LegalStrong> {DATA_CONTROLLER.privacyChannel}</>,
                  <><LegalStrong>Support and institutional inquiries:</LegalStrong> {DATA_CONTROLLER.supportChannel}</>,
                ]}
              />
            </LegalSection>

            <LegalSection title="2. Personal Data We Collect">
              <LegalBullets
                items={[
                  <><LegalStrong>Account data:</LegalStrong> email address, username, full name, authentication credentials handled by our authentication provider, role (student, alumni, staff, admin), and security settings such as two-factor authentication status.</>,
                  <><LegalStrong>Profile data:</LegalStrong> institution, faculty/department, level, bio, interests, avatar and banner images, and preferences you choose to add.</>,
                  <><LegalStrong>University email and verification data:</LegalStrong> your institutional email domain and, if you apply for the verified tick, verification documents such as a student ID card or admission letter that you upload, together with the review decision.</>,
                  <><LegalStrong>User content:</LegalStrong> forum posts, comments, study resources, marketplace listings, event registrations, mentorship requests, support tickets and reports you file.</>,
                  <><LegalStrong>Messages:</LegalStrong> direct and group chat messages and attachments, and call metadata for Jitsi Meet calls.</>,
                  <><LegalStrong>Device and notification data:</LegalStrong> push notification tokens and basic device information needed to deliver notifications.</>,
                  <><LegalStrong>Usage and log data:</LegalStrong> IP address, timestamps, and security and audit logs of sensitive actions (for example administrative and moderation actions).</>,
                  <><LegalStrong>AI Study Copilot data:</LegalStrong> the prompts and images you choose to submit to the AI Study Copilot.</>,
                ]}
              />
              <LegalParagraph>
                We do not intentionally collect special categories of personal data (such as health, biometric, religious
                or political data). Please do not upload such data unless it is strictly necessary. Verification
                documents can contain photographs and identifying numbers; we limit access to authorised reviewers.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="3. Why We Use Your Data and Our Lawful Basis">
              <LegalBullets
                items={[
                  <><LegalStrong>Provide your account and the core service</LegalStrong> (sign-up, sign-in, profile, forums, chat, resources, events, marketplace, mentorship). Lawful basis: performance of a contract with you.</>,
                  <><LegalStrong>Verify that you belong to a university</LegalStrong> (institutional email checks and reviewing verification documents). Lawful basis: performance of a contract and our legitimate interest in keeping campus spaces trustworthy; where you submit a document voluntarily, your consent.</>,
                  <><LegalStrong>AI Study Copilot.</LegalStrong> Lawful basis: your consent, given each time you choose to submit a prompt or image. You may stop using it at any time.</>,
                  <><LegalStrong>Push notifications.</LegalStrong> Lawful basis: your consent (you can switch notifications off in Settings and in your device settings).</>,
                  <><LegalStrong>Safety, moderation and abuse prevention</LegalStrong> (reports, blocking, spam and bot detection, audit logs). Lawful basis: legitimate interest, and legal obligation where we must act on unlawful content.</>,
                  <><LegalStrong>Security and integrity of the platform</LegalStrong> (rate limiting, fraud prevention, incident investigation). Lawful basis: legitimate interest and legal obligation to keep personal data secure.</>,
                  <><LegalStrong>Complying with the law</LegalStrong> (responding to lawful requests, breach notification). Lawful basis: legal obligation.</>,
                  <><LegalStrong>Recording your acceptance of these documents</LegalStrong> (Terms version and age-eligibility confirmation). Lawful basis: legitimate interest in evidencing consent and legal obligation.</>,
                ]}
              />
              <LegalParagraph>
                Where we rely on legitimate interest we have weighed it against your rights and freedoms. We do not sell
                your personal data, and we do not use it for advertising or for profiling that produces legal or
                similarly significant effects on you.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="4. Who Receives Your Data (Processors and Recipients)">
              <LegalBullets
                items={[
                  <><LegalStrong>Supabase</LegalStrong> - database, authentication and file storage that hold your account, content, messages and uploads.</>,
                  <><LegalStrong>Vercel</LegalStrong> - hosting and delivery of the web app (receives request metadata such as IP address).</>,
                  <><LegalStrong>Google (Gemini API)</LegalStrong> - processes the prompts and images you submit to the AI Study Copilot in order to generate answers. Requests are sent through our server-side proxy so that our API key is never exposed. Do not include other people's personal data in prompts.</>,
                  <><LegalStrong>Jitsi Meet</LegalStrong> - video and voice calls; your connection data is handled by the Jitsi service during a call.</>,
                  <><LegalStrong>Public data providers</LegalStrong> - weather, Open Library, Semantic Scholar / OpenAlex, radio-browser and OpenStreetMap / Overpass. When you use those features, your device or our app sends them your IP address and the query you enter (and, for weather and maps, the location you choose).</>,
                  <><LegalStrong>Other users and your institution</LegalStrong> - content you post is visible to the audience you select (for example your campus or the wider network). Administrators and moderators can see content and reports needed to keep the community safe.</>,
                  <><LegalStrong>Authorities</LegalStrong> - where the law requires or a court orders disclosure.</>,
                ]}
              />
              <LegalParagraph>
                We aim to disclose only what each recipient needs for the stated purpose. Each third-party provider
                processes data under its own contractual terms and privacy notice; provider practices can change, so
                review those notices before using an optional integration.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="5. International Transfers & Hosting Regions">
              <LegalParagraph>
                <LegalStrong>Your data is transferred outside Nigeria.</LegalStrong> Lioris does not currently operate servers in
                Nigeria: our processors run on secure cloud infrastructure in Sweden and the European Union, and
                (for web delivery and AI processing) potentially the United States and other countries. Hosting
                regions currently in use:
              </LegalParagraph>
              <LegalBullets
                items={[
                  <><LegalStrong>Web Application & Edge CDN:</LegalStrong> {HOSTING_REGIONS.web}</>,
                  <><LegalStrong>Core Database & Storage:</LegalStrong> {HOSTING_REGIONS.database}</>,
                  <><LegalStrong>AI Study Copilot Processing:</LegalStrong> {HOSTING_REGIONS.ai}</>,
                ]}
              />
              <LegalParagraph>
                Where personal data leaves Nigeria, we assess the transfer under sections 41 to 43 of the NDPA and use
                an available lawful transfer mechanism, such as an adequate level of protection, contractual safeguards,
                consent where legally valid, or another statutory exception. For EU/UK data, applicable transfer rules
                also apply. Safeguards vary by provider and destination; request current details through
                {` ${DATA_CONTROLLER.privacyChannel}`}.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="6. How Long We Keep Your Data">
              <LegalBullets
                items={[
                  <><LegalStrong>Account, profile and content:</LegalStrong> {RETENTION.accountData}.</>,
                  <><LegalStrong>Chat messages:</LegalStrong> {RETENTION.chatMessages}.</>,
                  <><LegalStrong>Verification documents:</LegalStrong> targeted for deletion within {RETENTION.verificationDocumentsDaysAfterDecision} days after the verification decision, unless required for a dispute, fraud prevention or law.</>,
                  <><LegalStrong>Audit and security logs:</LegalStrong> normally up to {RETENTION.auditLogsMonths} months, with longer retention where a security incident or legal duty requires it.</>,
                  <><LegalStrong>AI Copilot prompts and images:</LegalStrong> {RETENTION.aiPrompts}.</>,
                  <><LegalStrong>Deleted accounts:</LegalStrong> data is removed {RETENTION.deletedAccountPurge}; residual provider backups normally roll off within {RETENTION.backupRollOffDays} days and are not used for ordinary service activity.</>,
                ]}
              />
              <LegalParagraph>
                We may keep limited records for longer where the law requires it or to establish, exercise or defend
                legal claims.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="7. Your Rights">
              <LegalParagraph>
                Under the NDPA 2023 (and the GDPR / UK GDPR if they apply to you) you have the right to:
              </LegalParagraph>
              <LegalBullets
                items={[
                  'Be informed about, and access, the personal data we hold about you.',
                  'Have inaccurate or incomplete data corrected (rectification).',
                  'Have your data erased (right to be forgotten), subject to legal exceptions.',
                  'Restrict processing while a dispute about accuracy or lawfulness is resolved.',
                  'Receive your data in a structured, commonly used, machine-readable format and move it elsewhere (data portability).',
                  'Object to processing based on legitimate interest, and to any direct marketing.',
                  'Withdraw consent at any time, without affecting processing carried out before withdrawal.',
                  'Not be subject to a decision based solely on automated processing that significantly affects you. Lioris does not make such decisions; verification and moderation outcomes are reviewed by people.',
                ]}
              />
              <LegalParagraph>
                <LegalStrong>How to exercise them in the app:</LegalStrong> open Settings, then Privacy & Data. Use
                "Export my data" to download a copy of your data, and "Delete my account" to permanently erase your
                account and associated data, subject to the exceptions above. You can edit your profile directly in
                Settings. For any other request, use {DATA_CONTROLLER.privacyChannel}. We aim to respond within
                {` ${DSR_RESPONSE_DAYS}`} days and may need to verify your identity first.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="8. Children and Age Limit">
              <LegalParagraph>
                Lioris is for university communities. People aged {INDEPENDENT_AGE} or older may register themselves.
                An admitted university student aged {MIN_AGE}–17 may register only with authorisation from a parent or
                legal guardian and must confirm that authorisation during sign-up. People under {MIN_AGE} may not use
                Lioris. If we learn that an ineligible account was created, we may suspend it and delete the child's
                personal data, subject to safety and legal retention duties. Report a suspected ineligible account
                through {DATA_CONTROLLER.supportChannel}.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="9. Security">
              <LegalParagraph>
                We protect personal data using measures appropriate to the risk, including encryption in transit (TLS),
                encryption at rest provided by our infrastructure providers, row-level access controls in the database,
                hashed passwords, optional two-factor authentication for all users (mandatory for administrators and
                staff), rate limiting and bot detection, role-based access with audit logging of privileged actions, and
                server-side handling of secret keys. No system is perfectly secure; please use a strong, unique password
                and keep your authenticator app safe.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="10. Data Breaches">
              <LegalParagraph>
                If a personal data breach is likely to result in a risk to your rights and freedoms, we will notify the
                Nigeria Data Protection Commission within {BREACH_NOTIFICATION_HOURS} hours of becoming aware of it and,
                where the risk is high, tell affected users without undue delay, explaining what happened, what data is
                involved and what you can do.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="11. Cookies and Local Storage">
              <LegalParagraph>
                Lioris uses only strictly necessary storage: session tokens (secure storage on mobile, browser storage on
                the web) to keep you signed in, and preference settings such as theme and notification choices. We do not
                use advertising or cross-site tracking cookies or third-party analytics trackers. Clearing your browser
                storage or signing out removes the local copy from that device; server-side account data remains until
                it is deleted under the process described above.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="12. Complaints">
              <LegalParagraph>
                Please contact us first so we can try to fix the problem. You also have the right to lodge a complaint
                with the {NDPC.name} ({NDPC.website}) or, if you are in the EU/UK, with your local data-protection
                supervisory authority.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="13. Changes to This Notice">
              <LegalParagraph>
                We may update this notice. Material changes will be announced in the app and the version below will be
                updated. Privacy Policy version: <LegalStrong>{PRIVACY_VERSION}</LegalStrong>.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="14. Contact">
              <LegalParagraph>
                <LegalStrong>Privacy and data requests:</LegalStrong> {DATA_CONTROLLER.privacyChannel}
                {'\n'}
                <LegalStrong>Campus support and platform administration:</LegalStrong> {DATA_CONTROLLER.supportChannel}
              </LegalParagraph>
            </LegalSection>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
