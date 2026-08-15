import React, { useState } from'react';
import { ScrollView, View, Pressable, Alert, Modal } from'react-native';
import { Image } from'expo-image';
import { router } from'expo-router';
import { useQuery, useQueryClient } from'@tanstack/react-query';
import { Ionicons } from'@expo/vector-icons';
import { ScreenContainer } from'@/components/ScreenContainer';
import { AppHeader } from'@/components/AppHeader';
import { SolidCard } from'@/components/SolidCard';
import { AppText } from'@/components/AppText';
import { AppButton } from'@/components/AppButton';
import { Avatar } from'@/components/Avatar';
import { Badge } from'@/components/Badge';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { getMyProfile, updateProfileImages } from '@/api/profile';
import { listEvents } from '@/api/events';
import { listDashboardShortcuts, DashboardShortcut } from '@/api/adminShortcuts';

const COVER_PRESETS = [
  { id: 'campus_students_photo', label: 'Campus Quad', src: require('../../assets/images/campus_students_photo.jpg') },
  { id: 'campus_library_study', label: 'University Library', src: require('../../assets/images/campus_library_study.jpg') },
  { id: 'student_rep_group', label: 'Student Senate 🤝', src: require('../../assets/images/student_rep_group.jpg') },
  { id: 'event_tech_hackathon', label: 'Hackfest Arena', src: require('../../assets/images/event_tech_hackathon.jpg') },
  { id: 'hero_student_3d', label: 'Futuristic Studio', src: require('../../assets/images/hero_student_3d.jpg') },
];

const AVATAR_PRESETS = [
  { id: 'avatar_male', label: 'Male Student 👨‍', src: require('../../assets/images/avatar_male.jpg') },
  { id: 'avatar_female', label: 'Female Student 👩‍', src: require('../../assets/images/avatar_female.jpg') },
  { id: 'avatar_male_2', label: 'Engineering Student', src: require('../../assets/images/avatar_male_2.jpg') },
  { id: 'avatar_female_2', label: 'Honor Scholar', src: require('../../assets/images/avatar_female_2.jpg') },
  { id: 'avatar_alumni_2', label: 'Alumni Founder', src: require('../../assets/images/avatar_alumni_2.jpg') },
  { id: 'avatar_mentor', label: 'Faculty Advisor 🧑‍', src: require('../../assets/images/avatar_mentor.jpg') },
];

export default function StudentDashboard() {
  const { colors, spacing, radius } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['profile', 'me', user?.id],
    queryFn: () => getMyProfile(user!),
    enabled: !!user,
  });

  const { data: events } = useQuery({ queryKey: ['events', 'student'], queryFn: () => listEvents({ scope: 'student' }) });
  const { data: shortcuts } = useQuery({
    queryKey: ['dashboard-shortcuts', 'student'],
    queryFn: () => listDashboardShortcuts('student'),
  });

  const firstName = profile?.fullName?.split(' ')[0] ?? user?.fullName?.split(' ')[0] ?? 'Diana';
  const activeCover = COVER_PRESETS.find((c) => c.id === profile?.coverUrl)?.src ?? require('../../assets/images/campus_students_photo.jpg');

  async function handleSelectAvatar(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { avatarUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setPhotoPickerOpen(false);
    Alert.alert('Avatar Updated', 'New profile avatar applied.');
  }

  async function handleSelectCover(presetId: string) {
    if (!user) return;
    await updateProfileImages(user.id, { coverUrl: presetId });
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setPhotoPickerOpen(false);
    Alert.alert('Campus Banner Updated', 'New cover banner applied.');
  }

  const { isFeatureEnabled } = useFeatureFlags();

  return (
    <ScreenContainer glow={true}>
      <AppHeader />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"nestedScrollEnabled
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Customizable Campus Cover Banner */}
        <View
          style={{
            height: 140,
            borderRadius: 20,
            overflow: 'hidden',
            marginTop: spacing.sm,
            marginBottom: spacing.md,
            position: 'relative',
          }}
        >
          <Image source={activeCover} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' }} />

          <View style={{ position: 'absolute', top: 12, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#48BB78' }} />
              <AppText variant="caption"weight="bold"tone="inverse">
                {profile?.institutionName ?? 'University of Ibadan'}
              </AppText>
            </View>
          </View>

          {/* Change Photo Trigger */}
          <Pressable
            onPress={() => setPhotoPickerOpen(true)}
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 5,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Ionicons name="camera"size={13} color="#FFFFFF" />
            <AppText variant="caption"weight="bold"tone="inverse"style={{ fontSize: 10 }}>
              Customize
            </AppText>
          </Pressable>

          <View style={{ position: 'absolute', bottom: 12, left: 14 }}>
            <AppText variant="h2"weight="bold"tone="inverse">
              Hello {firstName}
            </AppText>
            <AppText tone="inverse"variant="caption"style={{ opacity: 0.9 }}>
              {profile?.department ?? 'Computer Science & AI'} | Level {profile?.level ?? 4}
            </AppText>
          </View>
        </View>

        {/* Quick Search Bar Pill */}
        <Pressable
          onPress={() => router.push('/(student)/search')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: radius.pill,
            paddingHorizontal: spacing.md,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: colors.border,
            gap: spacing.sm,
            marginBottom: spacing.md,
          }}
        >
          <Ionicons name="search"size={18} color={colors.textSecondary} />
          <AppText tone="secondary"variant="bodySmall">
            Search threads, past questions, events, portals...
          </AppText>
        </Pressable>

        {/* High-Utility Next Class Countdown Widget */}
        {isFeatureEnabled('utility_cards') && (
          <SolidCard radius={20} backgroundColor={colors.pastelPrimaryBg} style={{ marginBottom: spacing.md, borderWidth: 1, borderColor: colors.brandPrimary }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="time"size={16} color={colors.brandPrimary} />
                <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1 }}>
                  NEXT LECTURE TODAY • IN 42 MINS
                </AppText>
              </View>
              <Badge label="LT 2 Main"tone="brand" />
            </View>

            <AppText variant="h3"weight="bold"style={{ marginBottom: 2 }}>
              CSC 301: Advanced Algorithms & Data Structures
            </AppText>
            <AppText tone="secondary"variant="caption"style={{ marginBottom: spacing.sm }}>
              11:00 AM – 1:00 PM • Prof. O. Adeyemi • Topic: Dynamic Programming & Graphs
            </AppText>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => router.push('/(student)/resources')}
                style={{
                  flex: 1,
                  backgroundColor: colors.surface,
                  borderRadius: radius.pill,
                  paddingVertical: 7,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <AppText variant="caption"weight="bold"tone="brand">
                   Course Notes & Solved PQs
                </AppText>
              </Pressable>
              <Pressable
                onPress={() => router.push('/(student)/calendar')}
                style={{
                  flex: 1,
                  backgroundColor: colors.brandPrimary,
                  borderRadius: radius.pill,
                  paddingVertical: 7,
                  alignItems: 'center',
                }}
              >
                <AppText variant="caption"weight="bold"tone="inverse">
                   Full Timetable →
                </AppText>
              </Pressable>
            </View>
          </SolidCard>
        )}

        {/* Live Study Squads & Campus Hub Activity */}
        {isFeatureEnabled('study_groups') && (
          <View style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="h3"weight="bold">
                Live Study Squads & Hubs 
              </AppText>
              <Badge label="2 Active Now"tone="success" />
            </View>

            <View style={{ gap: spacing.sm }}>
              <SolidCard radius={16}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name="location"size={14} color={colors.brandPrimary} />
                      <AppText weight="bold"variant="bodySmall">
                        Senate E-Library (2nd Floor Quiet Zone)
                      </AppText>
                    </View>
                    <AppText tone="secondary"variant="caption">
                      28 students • CSC 301 & MEE 305 peer revision sprint
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(student)/feed')}
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                    }}
                  >
                    <AppText variant="caption"weight="bold"tone="brand">
                      Join Squad 
                    </AppText>
                  </Pressable>
                </View>
              </SolidCard>

              <SolidCard radius={16}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Ionicons name="code-slash"size={14} color={colors.brandPrimary} />
                      <AppText weight="bold"variant="bodySmall">
                        Tech Hub / Hackfest Arena (Faculty Hall)
                      </AppText>
                    </View>
                    <AppText tone="secondary"variant="caption">
                      14 students • Team Aqua demo rehearsal & mobile UI testing
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(student)/feed')}
                    style={{
                      backgroundColor: colors.pastelPrimaryBg,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.pill,
                    }}
                  >
                    <AppText variant="caption"weight="bold"tone="brand">
                      View Demo 
                    </AppText>
                  </Pressable>
                </View>
              </SolidCard>
            </View>
          </View>
        )}

        {/* Dynamic Campus Utilities & Portal Grid */}
        {isFeatureEnabled('utility_cards') && (
          <View style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="h3"weight="bold">
                Campus Utilities & Portals 
              </AppText>
              <Pressable onPress={() => router.push('/(student)/resources')}>
                <AppText tone="brand"variant="bodySmall"weight="bold">
                  View All →
                </AppText>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {shortcuts?.map((item) => {
                const colorInfo = SHORTCUT_COLOR_MAP[item.iconColor] ?? SHORTCUT_COLOR_MAP.sage;
                const route = resolveShortcutRoute(item.internalAction);
                return (
                  <ShortcutTile
                    key={item.id}
                    icon={item.icon as any}
                    bg={colors[colorInfo.bgKey]}
                    iconColor={colors[colorInfo.textKey]}
                    title={item.title}
                    subtitle={item.description}
                    subtitleColor={colors[colorInfo.textKey]}
                    onPress={() => {
                      if (route) {
                        router.push(route as any);
                      } else {
                        Alert.alert(item.title, item.description);
                      }
                    }}
                  />
                );
              })}
            </View>
          </View>
        )}

        {/* Featured Campus Events Preview */}
        {isFeatureEnabled('campus_events') && (
          <View style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="h3"weight="bold">
                Featured Campus Events 
              </AppText>
              <Pressable onPress={() => router.push('/(student)/events-list')}>
                <AppText tone="brand"variant="bodySmall"weight="bold">
                  See All ({events?.length ?? 0}) →
                </AppText>
              </Pressable>
            </View>

            {events?.slice(0, 2).map((evt) => (
              <SolidCard key={evt.id} radius={18} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: radius.md,
                      backgroundColor: colors.pastelPrimaryBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.brandPrimary,
                    }}
                  >
                    <Ionicons name="calendar"size={22} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText weight="bold"variant="bodySmall">
                      {evt.title}
                    </AppText>
                    <AppText tone="secondary"variant="caption">
                       {evt.location} • {evt.rsvpCount} RSVPs
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => router.push('/(student)/events-list')}
                    style={{
                      backgroundColor: colors.brandPrimary,
                      borderRadius: radius.pill,
                      paddingHorizontal: spacing.md,
                      paddingVertical: 6,
                    }}
                  >
                    <AppText variant="caption"weight="bold"tone="inverse">
                      RSVP
                    </AppText>
                  </Pressable>
                </View>
              </SolidCard>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Photo Picker Modal */}
      <Modal visible={photoPickerOpen} transparent animationType="slide"onRequestClose={() => setPhotoPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="images"size={20} color={colors.brandPrimary} />
                <AppText variant="h3"weight="bold">
                  Customize App Photos 📷
                </AppText>
              </View>
              <Pressable onPress={() => setPhotoPickerOpen(false)} hitSlop={8}>
                <Ionicons name="close"size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
                CHOOSE AVATAR PHOTO
              </AppText>
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                {AVATAR_PRESETS.map((preset) => {
                  const isSelected = profile?.avatarUrl === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleSelectAvatar(preset.id)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        padding: spacing.sm,
                        borderRadius: radius.md,
                        borderWidth: 2,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                        backgroundColor: isSelected ? colors.pastelPrimaryBg : colors.background,
                      }}
                    >
                      <Image source={preset.src} style={{ width: 56, height: 56, borderRadius: 28, marginBottom: 4 }} />
                      <AppText variant="caption"weight="bold"numberOfLines={1}>
                        {preset.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 1, marginBottom: spacing.xs }}>
                CHOOSE CAMPUS BANNER
              </AppText>
              <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
                {COVER_PRESETS.map((preset) => {
                  const isSelected = profile?.coverUrl === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleSelectCover(preset.id)}
                      style={{
                        height: 75,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                        position: 'relative',
                        borderWidth: 2,
                        borderColor: isSelected ? colors.brandPrimary : colors.border,
                      }}
                    >
                      <Image source={preset.src} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingLeft: spacing.md }}>
                        <AppText variant="bodySmall"weight="bold"tone="inverse">
                          {preset.label}
                        </AppText>
                        {isSelected ? (
                          <AppText variant="caption"weight="bold"tone="brand"style={{ color: '#68D391' }}>
                            ✓ Active Banner
                          </AppText>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <AppButton label="Done"onPress={() => setPhotoPickerOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function resolveShortcutRoute(internalAction: string): string | null {
  switch (internalAction) {
    case'library':
    case'courses':
    case'past_questions':
      return'/(student)/resources';
    case'timetable':
      return'/(student)/calendar';
    case'upload_events':
      return'/(student)/events-list';
    default:
      return null;
  }
}

const SHORTCUT_COLOR_MAP: Record<
  DashboardShortcut['iconColor'],
  { bgKey: 'sageBg' | 'roseBg' | 'mintBg' | 'lavenderBg'; textKey: 'sageText' | 'roseText' | 'mintText' | 'lavenderText' }
> = {
  sage: { bgKey: 'sageBg', textKey: 'sageText' },
  rose: { bgKey: 'roseBg', textKey: 'roseText' },
  mint: { bgKey: 'mintBg', textKey: 'mintText' },
  lavender: { bgKey: 'lavenderBg', textKey: 'lavenderText' },
};

function ShortcutTile({
  icon,
  bg,
  iconColor,
  title,
  subtitle,
  subtitleColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  subtitleColor: string;
  onPress: () => void;
}) {
  const { spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"accessibilityLabel={`${title}, ${subtitle}`}
      style={{ width: '48%' }}
    >
      <SolidCard backgroundColor={bg} radius={18}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.sm,
            backgroundColor: 'rgba(255,255,255,0.65)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.sm,
          }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <AppText weight="bold"variant="bodySmall"style={{ marginBottom: 2 }}>
          {title}
        </AppText>
        <AppText variant="caption"weight="semiBold"style={{ color: subtitleColor }} numberOfLines={1}>
          {subtitle}
        </AppText>
      </SolidCard>
    </Pressable>
  );
}
