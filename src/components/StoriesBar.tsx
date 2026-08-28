import React from'react';
import { ScrollView, View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { Avatar } from'./Avatar';
import { useTheme } from'@/theme/ThemeProvider';

import { useFeatureFlags } from '@/context/FeatureFlagsContext';

const MOCK_STORIES = ['Tunde', 'Chioma', 'Sade', 'Adebayo', 'Sithole'];

/** Ported from StoriesBar (DashboardAndProfile.kt): "My Story" add bubble + friends' story avatars in a ring border. */
export function StoriesBar() {
 const { colors, spacing } = useTheme();
 const { isFeatureEnabled } = useFeatureFlags();

 if (!isFeatureEnabled('stories_bar')) {
 return null;
 }

 return (
 <ScrollView
 horizontal
 showsHorizontalScrollIndicator={false}
 contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}
 style={{ flex: 1, minWidth: 0 }}
 >
 <View style={{ alignItems: 'center', width: 64 }}>
 <View
 style={{
 width: 60,
 height: 60,
 borderRadius: 30,
 backgroundColor: `${colors.brandPrimary}18`,
 alignItems: 'center',
 justifyContent: 'center',
 marginBottom: 4,
 }}
 >
 <Ionicons name="add"size={22} color={colors.brandPrimary} />
 </View>
 <AppText variant="caption">My Story</AppText>
 </View>

 {MOCK_STORIES.map((name) => (
 <View key={name} style={{ alignItems: 'center', width: 64 }}>
 <View
 style={{
 width: 60,
 height: 60,
 borderRadius: 30,
 borderWidth: 2,
 borderColor: colors.brandPrimary,
 alignItems: 'center',
 justifyContent: 'center',
 marginBottom: 4,
 }}
 >
 <Avatar name={name} size={54} />
 </View>
 <AppText variant="caption"numberOfLines={1}>
 {name}
 </AppText>
 </View>
 ))}
 </ScrollView>
 );
}
