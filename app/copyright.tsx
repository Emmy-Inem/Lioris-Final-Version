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
import { COPYRIGHT_POLICY_VERSION, COPYRIGHT_TAKEDOWN, DATA_CONTROLLER } from '@/constants/legal';

export default function CopyrightPolicyScreen() {
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
        accessibilityLabel="Copyright and takedown policy content"
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
                COPYRIGHT & TAKEDOWN
              </AppText>
              <AppText
                variant="h1"
                weight="bold"
                style={{ fontSize: isDesktop ? 36 : 28, marginTop: 6, color: isDark ? '#FFF' : '#0F172A' }}
              >
                Copyright & Takedown Policy
              </AppText>
              <AppText variant="bodySmall" tone="secondary" style={{ marginTop: 4 }}>
                Version {COPYRIGHT_POLICY_VERSION} • {DATA_CONTROLLER.legalName}
              </AppText>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />

            <LegalSection title="1. Our approach">
              <LegalParagraph>
                Lioris is a platform where students share study materials with each other. We do not write or own the
                lecture notes, slides, past questions and other materials that members upload, and we respect the
                rights of the lecturers, authors and institutions who do. This page explains what you may share, how a
                lecturer or other rights holder can ask for material to be removed, and what we do when they ask.
                It follows a notice-and-takedown process consistent with the Nigerian Copyright Act 2022 and comparable laws.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="2. What you may share">
              <LegalBullets
                items={[
                  'Your own work: your own notes, summaries, solutions and projects.',
                  'Material you have permission to share, for example when the lecturer or author has said students may circulate it.',
                  'Material that is openly licensed or in the public domain.',
                  'Do NOT upload a lecturer’s slides, handouts or notes, scanned textbooks, paid course packs or active examination questions unless you have that permission.',
                ]}
              />
              <LegalParagraph>
                When you upload a file you confirm that you created it or are allowed to share it, and you grant Lioris
                permission to store it and show it to members of the campus community for the purpose of running the
                service. Lioris does not verify every upload before it appears, so you are responsible for what you share.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="3. Lecturers and rights holders: asking for removal">
              <LegalParagraph>
                If you wrote a piece of material, or you are authorised to act for whoever did, and you do not want it on
                Lioris, you do not need to give a reason beyond the details below and you do not need to be verified.
              </LegalParagraph>
              <LegalBullets
                items={[
                  <>
                    Open the resource and tap the <LegalStrong>flag</LegalStrong> (Report) button, then choose{' '}
                    <LegalStrong>“This is my work - please remove it”</LegalStrong> or{' '}
                    <LegalStrong>“I’m acting for the rights holder”</LegalStrong>.
                  </>,
                  'Give your full name, a contact email, your role (for example “Lecturer, Department of Chemistry”) and a short description of the material.',
                  'Confirm the good-faith statement: that you own or represent the owner of the material, that it is shared without permission, and that your information is accurate.',
                  <>
                    Don’t have an account? Create a free one, or use{' '}
                    <LegalStrong>{DATA_CONTROLLER.supportChannel}</LegalStrong>
                    {COPYRIGHT_TAKEDOWN.email ? (
                      <>
                        , or write to <LegalStrong>{COPYRIGHT_TAKEDOWN.email}</LegalStrong>
                      </>
                    ) : null}
                    .
                  </>,
                ]}
              />
              <LegalParagraph>
                Only the people who created a piece of material, or act for them, can have it removed under this
                process. If you believe something infringes the rights of someone else, you can still report it and we
                will review it, but it is not taken offline automatically.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="4. What happens next">
              <LegalBullets
                items={[
                  'The resource is taken offline immediately when a rights holder (or their agent) sends the request. It stays hidden while we review it.',
                  `An administrator reviews the request, aiming to decide within ${COPYRIGHT_TAKEDOWN.reviewTargetDays} working days.`,
                  'If the request is upheld, the resource and its stored file are permanently deleted.',
                  'If it is declined, the resource is restored and you are told why. You can reply through the Support Desk.',
                  'The person who shared the file is told it was taken offline. Your name and email are kept as our record of the request and are not shown to them.',
                ]}
              />
            </LegalSection>

            <LegalSection title="5. If your upload was removed">
              <LegalParagraph>
                If you believe your upload was taken down by mistake - for example you created it yourself, or you have
                the rights holder’s permission - open <LegalStrong>{DATA_CONTROLLER.supportChannel}</LegalStrong>,
                choose “Content Flag”, and explain what you shared and why you may share it. We will review it and may
                contact the person who made the request. We can restore material where the request is withdrawn or was
                not valid; we will not restore it while a valid rights-holder request stands.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="6. Repeat infringement">
              <LegalParagraph>
                Members whose uploads are repeatedly removed because of valid rights-holder requests may lose the
                ability to upload and, where it continues, may have their account terminated.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="7. False or abusive requests">
              <LegalParagraph>
                A request that you know is false, or that is made to harass another member or to remove material you
                have no right to control, may lead to action against your account and, in some cases, legal
                liability for the person who made it. Please only send a request if you are the rights holder, or are
                authorised to act for them.
              </LegalParagraph>
            </LegalSection>

            <LegalSection title="8. Other content and other rights">
              <LegalParagraph>
                The same route applies to posts, images and marketplace listings: use the Report option on the item. For
                trademark or other intellectual-property concerns, contact us through{' '}
                <LegalStrong>{DATA_CONTROLLER.supportChannel}</LegalStrong>. This page describes our process and is not
                legal advice; it may be updated as the law or our service changes.
              </LegalParagraph>
            </LegalSection>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
