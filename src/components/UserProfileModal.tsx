import React, { useState } from'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from'react-native';
import { Image } from'expo-image';
import { router, useSegments } from'expo-router';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { Badge } from'./Badge';
import { UserTypeBadge } from'./UserTypeBadge';
import { SolidCard } from'./SolidCard';
import { AppButton } from'./AppButton';
import { useTheme } from'@/theme/ThemeProvider';
import { sendConnectionRequest } from'@/api/connections';
import { UserRole } from'@/api/types';
import { haptics } from'@/utils/haptics';

const STOCK_IMAGES: Record<string, any> = {
  campus_students_photo: require('../../assets/images/campus_students_photo.jpg'),
  campus_library_study: require('../../assets/images/campus_library_study.jpg'),
  student_rep_group: require('../../assets/images/student_rep_group.jpg'),
  event_tech_hackathon: require('../../assets/images/event_tech_hackathon.jpg'),
  hero_student_3d: require('../../assets/images/hero_student_3d.jpg'),
};

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  userName?: string;
  userRole?: UserRole;
  userAvatarUrl?: string | null;
  coverImageUrl?: string | null;
  department?: string;
  institution?: string;
}

export function UserProfileModal({
  visible,
  onClose,
  userId = 'user-1',
  userName = 'Campus Member',
  userRole = 'student',
  userAvatarUrl,
  coverImageUrl,
  department = 'Computer Science & AI',
  institution = 'University of Ibadan',
}: UserProfileModalProps) {
  const { colors, spacing, radius, isDark } = useTheme();
  const segments = useSegments();
  const roleGroup = segments[0] ?? '(student)';

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const isAlumni = userRole === 'alumni';
  const isStaff = userRole === 'staff';

  const bioText = isAlumni
    ? "Senior Software Architect @ Google. University of Ibadan Class of'21. Mentoring students in distributed systems & fintech architecture."
    : isStaff
    ? 'Associate Professor of Distributed Systems & Cloud Computing. Department of Computer Science. Research lead for Campus AI.'
    : 'Honors Student & President of Google Developer Student Club (GDSC). Passionate about Mobile Systems, React Native & Machine Learning.';

  const interests = isAlumni
    ? ['Cloud Architecture', 'Mentorship', 'Fintech', 'Angel Investing']
    : isStaff
    ? ['Computer Science', 'Distributed Systems', 'Curriculum Advisory']
    : ['React Native', 'TypeScript', 'Machine Learning', 'UI/UX Design', 'Algorithms'];

  const coverSource = coverImageUrl
    ? (STOCK_IMAGES[coverImageUrl] ?? { uri: coverImageUrl })
    : isAlumni
    ? STOCK_IMAGES.campus_library_study
    : isStaff
    ? STOCK_IMAGES.student_rep_group
    : STOCK_IMAGES.campus_students_photo;

  async function handleToggleConnect() {
    haptics.medium();
    if (connected) {
      setConnected(false);
      Alert.alert('Connection Removed', `You have disconnected from ${userName}.`);
      return;
    }

    setConnecting(true);
    try {
      await sendConnectionRequest(userId);
      setConnected(true);
      haptics.success();
      Alert.alert('Connection Request Sent', `Invitation dispatched to ${userName}. You will be notified when accepted.`);
    } catch {
      Alert.alert('Error', 'Could not send connection request.');
    } finally {
      setConnecting(false);
    }
  }

  function handleStartChat() {
    haptics.light();
    onClose();
    router.push(`/${roleGroup}/messages/conv-${userId}` as any);
  }

  return (
    <Modal visible={visible} transparent animationType="slide"onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            maxHeight: '90%',
            position: 'relative',
          }}
        >
          {/* Persistent Floating Close Button */}
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.65)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.25)',
              zIndex: 20,
            }}
          >
            <Ionicons name="close"size={20} color="#FFFFFF" />
          </Pressable>

          <ScrollView
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 50 }}
          >
            {/* Scrollable Cover Photo Banner (Scrolls naturally with content) */}
            <View style={{ height: 160, position: 'relative', width: '100%', backgroundColor: colors.pastelPrimaryBg }}>
              <Image
                source={coverSource}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"cachePolicy="memory-disk"transition={200}
              />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
            </View>

            {/* Profile Content Body */}
            <View style={{ paddingHorizontal: spacing.lg }}>
              {/* Avatar & Action Buttons Row (Overlaps bottom of cover naturally) */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -44, marginBottom: spacing.sm }}>
                <View
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: colors.surface,
                    borderWidth: 4,
                    borderColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.18,
                    shadowRadius: 8,
                    elevation: 6,
                  }}
                >
                  <Avatar name={userName} uri={userAvatarUrl} size={80} role={userRole} />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <AppButton
                    label={connected ? 'Connected' : 'Connect'}
                    variant={connected ? 'secondary' : 'primary'}
                    onPress={handleToggleConnect}
                    loading={connecting}
                  />
                  <AppButton
                    label="Message"variant="secondary"onPress={handleStartChat}
                  />
                </View>
              </View>

              {/* User Name & Academic Role Meta */}
              <View style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <AppText variant="h2"weight="bold">
                    {userName}
                  </AppText>
                  <Ionicons name="checkmark-circle"size={18} color={colors.brandPrimary} />
                  <UserTypeBadge role={userRole} />
                </View>

                <AppText tone="brand"weight="semiBold"variant="bodySmall"style={{ marginTop: 3 }}>
                  {institution} | {department}
                </AppText>

                <AppText tone="secondary"variant="caption"style={{ marginTop: 2 }}>
                  Member since Sept 2024 | Trust Score 9.6 / 10 | Verified Student
                </AppText>
              </View>

              {/* Quick Metrics Bar */}
              <SolidCard frosted radius={16} style={{ marginBottom: spacing.md, padding: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
                  <View style={{ alignItems: 'center' }}>
                    <AppText variant="h3"weight="bold"tone="brand">142</AppText>
                    <AppText tone="secondary"variant="caption">Connections</AppText>
                  </View>
                  <View style={{ width: 1, height: 28, backgroundColor: colors.divider }} />
                  <View style={{ alignItems: 'center' }}>
                    <AppText variant="h3"weight="bold"tone="brand">Lv. 4</AppText>
                    <AppText tone="secondary"variant="caption">Campus XP</AppText>
                  </View>
                  <View style={{ width: 1, height: 28, backgroundColor: colors.divider }} />
                  <View style={{ alignItems: 'center' }}>
                    <AppText variant="h3"weight="bold"tone="brand">18</AppText>
                    <AppText tone="secondary"variant="caption">Discussions</AppText>
                  </View>
                </View>
              </SolidCard>

              {/* Academic Bio */}
              <SolidCard frosted radius={16} style={{ marginBottom: spacing.md }}>
                <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.5, marginBottom: 4 }}>
                  ABOUT & ACADEMIC BIO
                </AppText>
                <AppText variant="bodySmall"tone="primary"style={{ lineHeight: 22 }}>
                  {bioText}
                </AppText>
              </SolidCard>

              {/* Academic Interests Tags */}
              <SolidCard frosted radius={16} style={{ marginBottom: spacing.md }}>
                <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.5, marginBottom: spacing.xs }}>
                  FOCUS AREAS & INTERESTS
                </AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {interests.map((tag) => (
                    <View
                      key={tag}
                      style={{
                        backgroundColor: colors.pastelPrimaryBg,
                        borderRadius: radius.pill,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: `${colors.brandPrimary}30`,
                      }}
                    >
                      <AppText variant="caption"weight="semiBold"tone="brand">
                        {tag}
                      </AppText>
                    </View>
                  ))}
                </View>
              </SolidCard>

              {/* Mutual Connections & Cohort */}
              <SolidCard frosted radius={16} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                  <AppText variant="caption"weight="bold"tone="brand"style={{ letterSpacing: 0.5 }}>
                    MUTUAL CONNECTIONS (12)
                  </AppText>
                  <Badge label="Verified Network"tone="brand" />
                </View>
                <AppText tone="secondary"variant="caption"style={{ lineHeight: 18 }}>
                  Connected with Diana Prince, Marcus Webb, Amina Yusuf and 9 other students in your department.
                </AppText>
              </SolidCard>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
