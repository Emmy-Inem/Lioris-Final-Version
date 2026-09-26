import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';

const AVATAR_FEMALE = require('../../assets/images/avatar_female.jpg');
const AVATAR_FEMALE_2 = require('../../assets/images/avatar_female_2.jpg');
const AVATAR_MALE = require('../../assets/images/avatar_male.jpg');
const AVATAR_MALE_2 = require('../../assets/images/avatar_male_2.jpg');
const AVATAR_ALUMNI = require('../../assets/images/avatar_alumni_2.jpg');
const AVATAR_MENTOR = require('../../assets/images/avatar_mentor.jpg');
const AVATAR_CLASS_REP = require('../../assets/images/class_rep_portrait.jpg');

// Authentic Nigerian University Student Portraits
const BOT_UI_TUNDE = require('../../assets/images/bots/bot_ui_tunde.jpg');
const BOT_UI_FUNKE = require('../../assets/images/bots/bot_ui_funke.jpg');
const BOT_UI_KEMI = require('../../assets/images/bots/bot_ui_kemi.jpg');
const BOT_UI_IBRAHIM = require('../../assets/images/bots/bot_ui_ibrahim.jpg');
const BOT_UI_SIMI = require('../../assets/images/bots/bot_ui_simi.jpg');
const BOT_UI_KAYODE = require('../../assets/images/bots/bot_ui_kayode.jpg');
const BOT_UI_BOLANLE = require('../../assets/images/bots/bot_ui_bolanle.jpg');

const BOT_UNILAG_CHINEDU = require('../../assets/images/bots/bot_unilag_chinedu.jpg');
const BOT_UNILAG_BLESSING = require('../../assets/images/bots/bot_unilag_blessing.jpg');
const BOT_UNILAG_FEMI = require('../../assets/images/bots/bot_unilag_femi.jpg');
const BOT_UNILAG_AMINA = require('../../assets/images/bots/bot_unilag_amina.jpg');
const BOT_UNILAG_DAYO = require('../../assets/images/bots/bot_unilag_dayo.jpg');
const BOT_UNILAG_ZAINAB = require('../../assets/images/bots/bot_unilag_zainab.jpg');
const BOT_UNILAG_EMEKA = require('../../assets/images/bots/bot_unilag_emeka.jpg');

const BOT_FUNAAB_DAMILOLA = require('../../assets/images/bots/bot_funaab_damilola.jpg');
const BOT_FUNAAB_OLAMIDE = require('../../assets/images/bots/bot_funaab_olamide.jpg');
const BOT_FUNAAB_FOLAKE = require('../../assets/images/bots/bot_funaab_folake.jpg');
const BOT_FUNAAB_EMMANUEL = require('../../assets/images/bots/bot_funaab_emmanuel.jpg');
const BOT_FUNAAB_NIYI = require('../../assets/images/bots/bot_funaab_niyi.jpg');
const BOT_FUNAAB_TITILAYO = require('../../assets/images/bots/bot_funaab_titilayo.jpg');

const PRESET_MAP: Record<string, any> = {
  avatar_female: AVATAR_FEMALE,
  avatar_female_2: AVATAR_FEMALE_2,
  avatar_male: AVATAR_MALE,
  avatar_male_2: AVATAR_MALE_2,
  avatar_alumni_2: AVATAR_ALUMNI,
  avatar_mentor: AVATAR_MENTOR,
  class_rep_portrait: AVATAR_CLASS_REP,

  // UI Bot Presets
  bot_ui_tunde: BOT_UI_TUNDE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Law_Students_Nigeria_Iftar_2023_01.jpg/500px-Law_Students_Nigeria_Iftar_2023_01.jpg': BOT_UI_TUNDE,
  bot_ui_funke: BOT_UI_FUNKE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Law_Students_Nigeria_Iftar_2023_02.jpg/500px-Law_Students_Nigeria_Iftar_2023_02.jpg': BOT_UI_FUNKE,
  bot_ui_kemi: BOT_UI_KEMI,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Law_Students_Nigeria_Iftar_2023_16.jpg/500px-Law_Students_Nigeria_Iftar_2023_16.jpg': BOT_UI_KEMI,
  bot_ui_ibrahim: BOT_UI_IBRAHIM,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Law_Students_Nigeria_Iftar_2023_12.jpg/500px-Law_Students_Nigeria_Iftar_2023_12.jpg': BOT_UI_IBRAHIM,
  bot_ui_simi: BOT_UI_SIMI,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Law_Students_Nigeria_Iftar_2023_17.jpg/500px-Law_Students_Nigeria_Iftar_2023_17.jpg': BOT_UI_SIMI,
  bot_ui_kayode: BOT_UI_KAYODE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Law_Students_Nigeria_Iftar_2023_13.jpg/500px-Law_Students_Nigeria_Iftar_2023_13.jpg': BOT_UI_KAYODE,
  bot_ui_bolanle: BOT_UI_BOLANLE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Law_Students_Nigeria_Iftar_2023_18.jpg/500px-Law_Students_Nigeria_Iftar_2023_18.jpg': BOT_UI_BOLANLE,

  // UNILAG Bot Presets
  bot_unilag_chinedu: BOT_UNILAG_CHINEDU,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Law_Students_Nigeria_Iftar_2023_14.jpg/500px-Law_Students_Nigeria_Iftar_2023_14.jpg': BOT_UNILAG_CHINEDU,
  bot_unilag_blessing: BOT_UNILAG_BLESSING,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Discovery_For_Youth_02.jpg/500px-Discovery_For_Youth_02.jpg': BOT_UNILAG_BLESSING,
  bot_unilag_femi: BOT_UNILAG_FEMI,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Law_Students_Nigeria_Iftar_2023_15.jpg/500px-Law_Students_Nigeria_Iftar_2023_15.jpg': BOT_UNILAG_FEMI,
  bot_unilag_amina: BOT_UNILAG_AMINA,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Discovery_For_Youth_03.jpg/500px-Discovery_For_Youth_03.jpg': BOT_UNILAG_AMINA,
  bot_unilag_dayo: BOT_UNILAG_DAYO,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Discovery_For_Youth_04.jpg/500px-Discovery_For_Youth_04.jpg': BOT_UNILAG_DAYO,
  bot_unilag_zainab: BOT_UNILAG_ZAINAB,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Discovery_For_Youth_05.jpg/500px-Discovery_For_Youth_05.jpg': BOT_UNILAG_ZAINAB,
  bot_unilag_emeka: BOT_UNILAG_EMEKA,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Discovery_For_Youth_06.jpg/500px-Discovery_For_Youth_06.jpg': BOT_UNILAG_EMEKA,

  // FUNAAB Bot Presets
  bot_funaab_damilola: BOT_FUNAAB_DAMILOLA,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Discovery_For_Youth_07.jpg/500px-Discovery_For_Youth_07.jpg': BOT_FUNAAB_DAMILOLA,
  bot_funaab_olamide: BOT_FUNAAB_OLAMIDE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Discovery_For_Youth_08.jpg/500px-Discovery_For_Youth_08.jpg': BOT_FUNAAB_OLAMIDE,
  bot_funaab_folake: BOT_FUNAAB_FOLAKE,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Discovery_For_Youth_09.jpg/500px-Discovery_For_Youth_09.jpg': BOT_FUNAAB_FOLAKE,
  bot_funaab_emmanuel: BOT_FUNAAB_EMMANUEL,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Discovery_For_Youth_10.jpg/500px-Discovery_For_Youth_10.jpg': BOT_FUNAAB_EMMANUEL,
  bot_funaab_niyi: BOT_FUNAAB_NIYI,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Discovery_For_Youth_11.jpg/500px-Discovery_For_Youth_11.jpg': BOT_FUNAAB_NIYI,
  bot_funaab_titilayo: BOT_FUNAAB_TITILAYO,
  'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Discovery_For_Youth_16.jpg/500px-Discovery_For_Youth_16.jpg': BOT_FUNAAB_TITILAYO,
};

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  role?: 'student' | 'staff' | 'alumni' | 'admin';
}

export function Avatar({ name, uri, size = 44, role }: AvatarProps) {
  const { colors, isDark } = useTheme();

  const imageSource = uri
    ? (PRESET_MAP[uri] ?? ((uri.startsWith('http') || uri.startsWith('file') || uri.startsWith('data:')) ? { uri } : null))
    : null;

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
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
          cachePolicy="disk"
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
