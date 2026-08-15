import React from'react';
import { StyleSheet, View } from'react-native';
import { Image } from'expo-image';
import { useTheme } from'@/theme/ThemeProvider';

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
}

function getAvatarForName(name: string, role?: string) {
  if (role === 'alumni') return AVATAR_ALUMNI;
  if (role === 'staff' || role === 'admin') return AVATAR_MENTOR;

  const lower = name.toLowerCase();
  if (lower.includes('diana') || lower.includes('fatima') || lower.includes('chidinma')) return AVATAR_FEMALE;
  if (lower.includes('amina') || lower.includes('sarah') || lower.includes('elena') || lower.includes('grace')) return AVATAR_FEMALE_2;
  if (lower.includes('tunde') || lower.includes('adebayo') || lower.includes('daniel')) return AVATAR_MALE;
  if (lower.includes('emeka') || lower.includes('alex') || lower.includes('david') || lower.includes('michael')) return AVATAR_MALE_2;
  if (lower.includes('rep') || lower.includes('council')) return AVATAR_CLASS_REP;

  // Hash name to pick across 4 rich student avatars
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % 4;
  const avatars = [AVATAR_MALE, AVATAR_FEMALE, AVATAR_MALE_2, AVATAR_FEMALE_2];
  return avatars[index];
}

export function Avatar({ name, uri, size = 44, role }: AvatarProps) {
  const { colors } = useTheme();

  const imageSource = uri
    ? PRESET_MAP[uri] ?? (uri.startsWith('http') || uri.startsWith('file') ? { uri } : getAvatarForName(name, role))
    : getAvatarForName(name, role);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        backgroundColor: colors.pastelPrimaryBg,
        borderWidth: 1.5,
        borderColor: colors.brandPrimary,
      }}
    >
      <Image
        source={imageSource}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"transition={200}
        cachePolicy="memory-disk"
      />
    </View>
  );
}
