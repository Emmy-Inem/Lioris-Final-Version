import React from'react';
import { View } from'react-native';
import { Ionicons } from'@expo/vector-icons';
import { AppText } from'./AppText';
import { useTheme } from'@/theme/ThemeProvider';

type Visibility = 'campus' | 'global' | 'private';

const CONFIG: Record<Visibility, { label: string; icon: keyof typeof Ionicons.glyphMap; lightBg: string; lightText: string; darkBg: string; darkText: string }> = {
 global: {
 label: 'Global',
 icon: 'globe-outline',
 lightBg: '#EFF6FF',
 lightText: '#1D4ED8',
 darkBg: 'rgba(96,165,250,0.18)',
 darkText: '#93C5FD',
 },
 private: {
 label: 'Private',
 icon: 'lock-closed-outline',
 lightBg: '#FEF2F2',
 lightText: '#991B1B',
 darkBg: 'rgba(252,165,165,0.18)',
 darkText: '#FCA5A5',
 },
 campus: {
 label: 'Campus',
 icon: 'school-outline',
 lightBg: '#ECFDF5',
 lightText: '#065F46',
 darkBg: 'rgba(52,211,153,0.18)',
 darkText: '#6EE7B7',
 },
};

export function VisibilityBadge({
 visibility,
 campusCode,
 subtle = false,
}: {
 visibility?: Visibility | string;
 campusCode?: string | null;
 /**
 * Plain icon + text with no background/border. Forum threads render one
 * of these on every single card, so a solid colored pill there competed
 * with the thread title for attention; a badge floating over an event's
 * cover photo (the default, pill variant) still needs the background for
 * legibility against an arbitrary image.
 */
 subtle?: boolean;
}) {
 const { isDark } = useTheme();
 const visKey = (visibility === 'global' ? 'global' : visibility === 'private' ? 'private' : 'campus') as Visibility;
 const config = CONFIG[visKey] || CONFIG.campus;
 const text = isDark ? config.darkText : config.lightText;
 const label =
 visKey === 'campus' && campusCode && campusCode !== 'GLOBAL'
 ? campusCode
 : config.label;

 if (subtle) {
 return (
 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' }}>
 <Ionicons name={config.icon} size={11} color={text} style={{ opacity: 0.85 }} />
 <AppText variant="caption" weight="medium" style={{ color: text, fontSize: 10.5, opacity: 0.85 }}>
 {label}
 </AppText>
 </View>
 );
 }

 const bg = isDark ? config.darkBg : config.lightBg;
 return (
 <View
 style={{
 backgroundColor: bg,
 borderRadius: 12,
 borderWidth: 1,
 borderColor: `${text}40`,
 paddingHorizontal: 8,
 paddingVertical: 2,
 alignSelf: 'flex-start',
 }}
 >
 <AppText variant="caption" weight="bold" style={{ color: text, fontSize: 11 }}>
 {label}
 </AppText>
 </View>
 );
}
