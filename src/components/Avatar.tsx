import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { SUPABASE_URL } from '@/api/supabase';

const AVATAR_FEMALE = require('../../assets/images/avatar_female.jpg');
const AVATAR_FEMALE_2 = require('../../assets/images/avatar_female_2.jpg');
const AVATAR_MALE = require('../../assets/images/avatar_male.jpg');
const AVATAR_MALE_2 = require('../../assets/images/avatar_male_2.jpg');
const AVATAR_ALUMNI = require('../../assets/images/avatar_alumni_2.jpg');
const AVATAR_MENTOR = require('../../assets/images/avatar_mentor.jpg');
const AVATAR_CLASS_REP = require('../../assets/images/class_rep_portrait.jpg');

const PRESET_MAP: Record<string, any> = {
  avatar_female: AVATAR_FEMALE,
  avatar_female_2: AVATAR_FEMALE_2,
  avatar_male: AVATAR_MALE,
  avatar_male_2: AVATAR_MALE_2,
  avatar_alumni_2: AVATAR_ALUMNI,
  avatar_mentor: AVATAR_MENTOR,
  class_rep_portrait: AVATAR_CLASS_REP,
};

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  role?: 'student' | 'staff' | 'alumni' | 'admin';
  /** Text alternative for the picture. Defaults to "<name>'s profile photo"; pass '' when the name is already read next to it. */
  alt?: string;
}

export function Avatar({ name, uri, size = 44, role, alt }: AvatarProps) {
  const { colors, isDark } = useTheme();

  const imageSource = (() => {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (!trimmed) return null;
    if (PRESET_MAP[trimmed]) return PRESET_MAP[trimmed];
    if (trimmed.startsWith('http') || trimmed.startsWith('file') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
      return { uri: trimmed };
    }
    if (/^[0-9a-fA-F-]{36}\//.test(trimmed) || trimmed.includes('/')) {
      const cleanPath = trimmed.replace(/^\/+/, '');
      return { uri: `${SUPABASE_URL}/storage/v1/object/public/avatars/${cleanPath}` };
    }
    return null;
  })();

  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.[0] || '').toUpperCase();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          accessibilityLabel={alt ?? ((name || '').trim() ? `${name.trim()}'s profile photo` : '')}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
          // Lists reuse Avatar views while scrolling: key the recycled view by the picture so it never flashes the
          // previous row's face, and keep decoded pictures in memory as well as on disk.
          recyclingKey={uri ?? undefined}
          cachePolicy="memory-disk"
          // Decode at the displayed size, never at the original resolution.
          allowDownscaling
        />
      ) : initials ? (
        <AppText
          weight="bold"
          style={{
            fontSize: Math.max(11, Math.round(size * 0.36)),
            color: colors.brandPrimary,
            letterSpacing: 0.5,
          }}
        >
          {initials}
        </AppText>
      ) : (
        <Ionicons
          name="person"
          size={Math.round(size * 0.48)}
          color={isDark ? '#94A3B8' : '#64748B'}
        />
      )}
    </View>
  );
}
