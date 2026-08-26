/**
 * Exact design tokens ported from the Lioris native Android reference
 * app (Kotlin/Jetpack Compose - com.example.ui.theme.Color.kt), not the
 * generic"blue/orange"tokens the PRD described. Hex values are 1:1
 * matches; do not"round"these to nearby brand-blue shades.
 *
 * CORRECTION: an earlier pass wrongly set the primary to green based on
 * a partial screenshot set. A larger, more complete screenshot set
 * (covering login/onboarding, Alumni Hub, Admin Workdesk, and several
 * modals) confirms the real primary is a deep navy blue, with the
 * flat-white-card style still correct. `navy*` tokens below drove
 * `brandPrimary`/`tabActive`/`sectionLabel` globally for that reason.
 *
 * DELIBERATE REBRAND (supersedes the above, per explicit design
 * request): `brandPrimary`/`tabActive`/`sectionLabel`/`pastelPrimaryBg`/
 * the glow blobs now pull from the new `teal*` tokens instead of
 * `navy*`, targeting the deep-teal look of a separate reference app
 * ("UniHub") the person asked Lioris to visually match. This is a
 * genuine reference-app swap, not a continuation of the navy
 * correction above - the navy tokens are kept (unused) rather than
 * deleted, in case of a future revert. `brandAccent` (orange) is
 * unchanged - UniHub's screenshots don't show a clear second brand
 * color, so the existing warm accent was left as reasonable contrast
 * rather than guessed at.
 */

const palette = {
 liorisBlue: '#1A3DFF', // Primary Brand Accent
 liorisSky: '#2EB7FF', // Light Blue Accent
 liorisCoral: '#FF6B4A', // Vibrant Utility/Orange
 liorisMagenta: '#C23AAE', // Accent Pink/Purple
 liorisDarkBg: '#0A1326', // Accessible Deep Navy Base
 liorisNeutralGray: '#667085', // Muted subtext
 liorisNeutralLight: '#E6E8EF', // Light-mode card borders & fills

 softOrange: '#FFEDD5',
 slateBg: '#F4F6F9',
 textDark: '#0A1326',

 darkBlueGlow: '#1D4ED8',
 deepNavyBg: '#0A1326',
 textLight: '#E6E8EF',

 // Corrected primary scheme - deep navy blue, read from the login,
 // Alumni Hub, and Admin Workdesk screenshots.
 navyPrimary: '#1B2F5E',
 navyPressed: '#14233F',
 navyDeep: '#152A4A', // section-label text
 navyPaleBg: '#E3E8F5', // info cards (Lioris Live box, workspace scope card, etc.)
 skyWhiteBg: '#F8FAF9', // ultra-clean modern light background
 waitlistOrange: '#F08A2E', // "Join Waitlist"button

 // UniHub-inspired modern campus teal palette
 tealPrimary: '#0B7A75', // main brand - buttons, active tab, headers
 tealPressed: '#075955', // pressed/darker state
 tealDeep: '#054744', // section-label text
 tealPaleBg: '#EBF7F5', // info-card and badge backgrounds
 tealGlowRgb: '11,122,117', // RGB triplet of tealPrimary, for rgba() glow blobs

 sageBg: '#E6F4EA',
 sageText: '#137333',
 roseBg: '#FCE8E6',
 roseText: '#C5221F',
 mintBg: '#E0F5F2',
 mintText: '#0B7A75',
 lavenderBg: '#F3E8FD',
 lavenderText: '#7C3AED',

 // Role badge colors (UserTypeBadge) - each role gets a distinct hue,
 // not just the brand blue. Light / dark variants per mode.
 studentGreenBgLight: '#ECFDF5',
 studentGreenTextLight: '#059669',
 studentGreenBgDark: 'rgba(52, 211, 153, 0.18)',
 studentGreenTextDark: '#6EE7B7',

 alumniPurpleBgLight: '#FAF5FF',
 alumniPurpleTextLight: '#7C3AED',
 alumniPurpleBgDark: 'rgba(174, 124, 250, 0.18)',
 alumniPurpleTextDark: '#D8B4FE',

 staffBlueBgLight: '#EFF6FF',
 staffBlueTextLight: '#2563EB',
 staffBlueBgDark: 'rgba(96, 165, 250, 0.18)',
 staffBlueTextDark: '#93C5FD',

 adminRedBgLight: '#FEF2F2',
 adminRedTextLight: '#DC2626',
 adminRedBgDark: 'rgba(252, 165, 165, 0.18)',
 adminRedTextDark: '#FCA5A5',

 success: '#1FAA59',
 warning: '#E8A400',
 critical: '#E5484D',
} as const;

export interface ThemeColors {
 background: string;
 surface: string;
 glassSurfaceTop: string;
 glassSurfaceBottom: string;
 glassBorderStart: string;
 glassBorderEnd: string;
 glassShadowColor: string;
 textPrimary: string;
 textSecondary: string;
 textInverse: string;
 brandPrimary: string;
 brandPrimaryPressed: string;
 brandAccent: string;
 brandAccentPressed: string;
 brandSky: string;
 brandMagenta: string;
 sectionLabel: string;
 pastelPrimaryBg: string;
 sageBg: string;
 sageText: string;
 roseBg: string;
 roseText: string;
 mintBg: string;
 mintText: string;
 lavenderBg: string;
 lavenderText: string;
 border: string;
 divider: string;
 success: string;
 warning: string;
 critical: string;
 alumniGradientStart: string;
 alumniGradientEnd: string;
 tabInactive: string;
 tabActive: string;
 tabActivePillBg: string;
 glowBlobPrimary: string;
 glowBlobAccent: string;
}

export const lightColors: ThemeColors = {
 background: palette.skyWhiteBg,
 surface: '#FFFFFF',
 // frostedCard (Common.kt): vertical gradient 97% white -> 93% light slate
 glassSurfaceTop: 'rgba(255,255,255,0.97)',
 glassSurfaceBottom: 'rgba(241,245,249,0.93)',
 glassBorderStart: 'rgba(230,232,239,0.3)',
 glassBorderEnd: 'rgba(230,232,239,0.15)',
 glassShadowColor: 'rgba(27,47,94,0.12)',

 textPrimary: palette.textDark,
 textSecondary: palette.liorisNeutralGray,
 textInverse: '#FFFFFF',

 brandPrimary: palette.tealPrimary,
 brandPrimaryPressed: palette.tealPressed,
 brandAccent: palette.waitlistOrange,
 brandAccentPressed: '#D97517',
 brandSky: palette.liorisSky,
 brandMagenta: palette.liorisMagenta,
 sectionLabel: palette.tealDeep,
 pastelPrimaryBg: palette.tealPaleBg,
 sageBg: palette.sageBg,
 sageText: palette.sageText,
 roseBg: palette.roseBg,
 roseText: palette.roseText,
 mintBg: palette.mintBg,
 mintText: palette.mintText,
 lavenderBg: palette.lavenderBg,
 lavenderText: palette.lavenderText,

 border: palette.liorisNeutralLight,
 divider: '#EEF0F3',

 success: palette.success,
 warning: palette.warning,
 critical: palette.critical,

 alumniGradientStart: palette.liorisBlue,
 alumniGradientEnd: palette.liorisDarkBg,

 tabInactive: palette.liorisNeutralGray,
 tabActive: palette.tealPrimary,
 tabActivePillBg: palette.tealPaleBg,

 glowBlobPrimary: `rgba(${palette.tealGlowRgb},0.12)`,
 glowBlobAccent: 'rgba(240,138,46,0.08)',
} as const;

export const darkColors: ThemeColors = {
 background: '#0B1120',
 surface: '#131E32',
 // frostedCard dark: vertical gradient 92% slate-900 -> 96% deep navy
 glassSurfaceTop: 'rgba(23, 37, 66, 0.94)',
 glassSurfaceBottom: 'rgba(12, 22, 42, 0.97)',
 glassBorderStart: 'rgba(255, 255, 255, 0.14)',
 glassBorderEnd: 'rgba(255, 255, 255, 0.06)',
 glassShadowColor: 'rgba(0, 0, 0, 0.45)',

 textPrimary: '#FFFFFF',
 textSecondary: '#94A3B8',
 textInverse: '#FFFFFF',

 brandPrimary: '#2DD4BF',
 brandPrimaryPressed: '#14B8A6',
 brandAccent: '#FB923C',
 brandAccentPressed: '#F97316',
 brandSky: '#38BDF8',
 brandMagenta: '#F472B6',
 sectionLabel: '#5EEAD4',
 pastelPrimaryBg: 'rgba(45, 212, 191, 0.14)',
 sageBg: 'rgba(27, 122, 75, 0.22)',
 sageText: '#6EE7B7',
 roseBg: 'rgba(155, 44, 59, 0.24)',
 roseText: '#FCA5A5',
 mintBg: 'rgba(15, 118, 110, 0.24)',
 mintText: '#5EEAD4',
 lavenderBg: 'rgba(109, 93, 174, 0.26)',
 lavenderText: '#D8B4FE',

 border: 'rgba(255, 255, 255, 0.12)',
 divider: 'rgba(255, 255, 255, 0.08)',

 success: '#22C55E',
 warning: '#FBBF24',
 critical: '#EF4444',

 alumniGradientStart: '#1E40AF',
 alumniGradientEnd: '#0F172A',

 tabInactive: '#94A3B8',
 tabActive: '#2DD4BF',
 tabActivePillBg: 'rgba(45, 212, 191, 0.18)',

 glowBlobPrimary: 'rgba(45, 212, 191, 0.16)',
 glowBlobAccent: 'rgba(251, 146, 60, 0.10)',
} as const;

export const roleBadgeColors = {
 student: {
 light: { bg: palette.studentGreenBgLight, text: palette.studentGreenTextLight },
 dark: { bg: palette.studentGreenBgDark, text: palette.studentGreenTextDark },
 },
 alumni: {
 light: { bg: palette.alumniPurpleBgLight, text: palette.alumniPurpleTextLight },
 dark: { bg: palette.alumniPurpleBgDark, text: palette.alumniPurpleTextDark },
 },
 staff: {
 light: { bg: palette.staffBlueBgLight, text: palette.staffBlueTextLight },
 dark: { bg: palette.staffBlueBgDark, text: palette.staffBlueTextDark },
 },
 admin: {
 light: { bg: palette.adminRedBgLight, text: palette.adminRedTextLight },
 dark: { bg: palette.adminRedBgDark, text: palette.adminRedTextDark },
 },
} as const;

export { palette };

/**
 * Per-university brand colors. FUNAAB=green and UNILAG=blue were
 * explicitly specified; UI wasn't, so violet/purple was chosen as a
 * third color clearly distinct from the other two - a judgment call,
 * not a confirmed brand color, flagged here as such. Only the
 * brand-accent-adjacent fields are overridden; backgrounds, text,
 * borders, and the pastel shortcut-tile colors stay the same across
 * every institution so the rest of the UI doesn't need 3x the palettes.
 */
export const institutionThemeOverrides: Record<
 string,
 { light: Partial<ThemeColors>; dark: Partial<ThemeColors> }
> = {
 FUNAAB: {
 light: {
 brandPrimary: '#1B7A4B',
 brandPrimaryPressed: '#145C39',
 sectionLabel: '#134E31',
 pastelPrimaryBg: '#E7F1EA',
 tabActive: '#1B7A4B',
 tabActivePillBg: '#E7F1EA',
 glowBlobPrimary: 'rgba(27,122,75,0.12)',
 },
 dark: {
 brandPrimary: '#3FAE73',
 brandPrimaryPressed: '#1B7A4B',
 sectionLabel: '#6EE7B7',
 pastelPrimaryBg: 'rgba(27,122,75,0.18)',
 tabActive: '#3FAE73',
 tabActivePillBg: 'rgba(27,122,75,0.22)',
 glowBlobPrimary: 'rgba(27,122,75,0.22)',
 },
 },
 UNILAG: {
 light: {
 brandPrimary: '#1A3DFF',
 brandPrimaryPressed: '#1430CC',
 sectionLabel: '#15296B',
 pastelPrimaryBg: '#E3E8FF',
 tabActive: '#1A3DFF',
 tabActivePillBg: '#E3E8FF',
 glowBlobPrimary: 'rgba(26,61,255,0.12)',
 },
 dark: {
 brandPrimary: '#5D7FFF',
 brandPrimaryPressed: '#1A3DFF',
 sectionLabel: '#A8B8FF',
 pastelPrimaryBg: 'rgba(26,61,255,0.2)',
 tabActive: '#5D7FFF',
 tabActivePillBg: 'rgba(26,61,255,0.28)',
 glowBlobPrimary: 'rgba(26,61,255,0.28)',
 },
 },
 // Not an explicitly specified brand color - chosen to be clearly
 // distinct from FUNAAB's green and UNILAG's blue.
 UI: {
 light: {
 brandPrimary: '#6D28D9',
 brandPrimaryPressed: '#5B21B6',
 sectionLabel: '#4C1D95',
 pastelPrimaryBg: '#F1E9FE',
 tabActive: '#6D28D9',
 tabActivePillBg: '#F1E9FE',
 glowBlobPrimary: 'rgba(109,40,217,0.12)',
 },
 dark: {
 brandPrimary: '#A78BFA',
 brandPrimaryPressed: '#6D28D9',
 sectionLabel: '#D8B4FE',
 pastelPrimaryBg: 'rgba(109,40,217,0.2)',
 tabActive: '#A78BFA',
 tabActivePillBg: 'rgba(109,40,217,0.28)',
 glowBlobPrimary: 'rgba(109,40,217,0.28)',
 },
 },
 OAU: {
 light: {
 brandPrimary: '#B45309',
 brandPrimaryPressed: '#92400E',
 sectionLabel: '#78350F',
 pastelPrimaryBg: '#FEF3C7',
 tabActive: '#B45309',
 tabActivePillBg: '#FEF3C7',
 glowBlobPrimary: 'rgba(180,83,9,0.12)',
 },
 dark: {
 brandPrimary: '#FBBF24',
 brandPrimaryPressed: '#B45309',
 sectionLabel: '#FDE68A',
 pastelPrimaryBg: 'rgba(180,83,9,0.22)',
 tabActive: '#FBBF24',
 tabActivePillBg: 'rgba(180,83,9,0.28)',
 glowBlobPrimary: 'rgba(180,83,9,0.28)',
 },
 },
 GLOBAL: {
 light: {
 brandPrimary: '#0B7A75',
 brandPrimaryPressed: '#075955',
 sectionLabel: '#054744',
 pastelPrimaryBg: '#EBF7F5',
 tabActive: '#0B7A75',
 tabActivePillBg: '#EBF7F5',
 glowBlobPrimary: 'rgba(11,122,117,0.12)',
 },
 dark: {
 brandPrimary: '#2DD4BF',
 brandPrimaryPressed: '#14B8A6',
 sectionLabel: '#5EEAD4',
 pastelPrimaryBg: 'rgba(45, 212, 191, 0.14)',
 tabActive: '#2DD4BF',
 tabActivePillBg: 'rgba(45, 212, 191, 0.18)',
 glowBlobPrimary: 'rgba(45, 212, 191, 0.16)',
 },
 },
 ROSE: {
 light: {
 brandPrimary: '#BE123C',
 brandPrimaryPressed: '#9F1239',
 sectionLabel: '#881337',
 pastelPrimaryBg: '#FFE4E6',
 tabActive: '#BE123C',
 tabActivePillBg: '#FFE4E6',
 glowBlobPrimary: 'rgba(190,18,60,0.12)',
 },
 dark: {
 brandPrimary: '#FB7185',
 brandPrimaryPressed: '#BE123C',
 sectionLabel: '#FDA4AF',
 pastelPrimaryBg: 'rgba(251,113,133,0.18)',
 tabActive: '#FB7185',
 tabActivePillBg: 'rgba(251,113,133,0.22)',
 glowBlobPrimary: 'rgba(251,113,133,0.22)',
 },
 },
 INDIGO: {
 light: {
 brandPrimary: '#4338CA',
 brandPrimaryPressed: '#3730A3',
 sectionLabel: '#312E81',
 pastelPrimaryBg: '#E0E7FF',
 tabActive: '#4338CA',
 tabActivePillBg: '#E0E7FF',
 glowBlobPrimary: 'rgba(67,56,202,0.12)',
 },
 dark: {
 brandPrimary: '#818CF8',
 brandPrimaryPressed: '#4338CA',
 sectionLabel: '#C7D2FE',
 pastelPrimaryBg: 'rgba(129,140,248,0.18)',
 tabActive: '#818CF8',
 tabActivePillBg: 'rgba(129,140,248,0.22)',
 glowBlobPrimary: 'rgba(129,140,248,0.22)',
 },
 },
};

export interface AccentPreset {
 id: string;
 label: string;
 campusName?: string;
 primaryLight: string;
 primaryDark: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
 { id: 'UI', label: 'Ibadan Violet', campusName: 'University of Ibadan', primaryLight: '#6D28D9', primaryDark: '#A78BFA' },
 { id: 'UNILAG', label: 'Lagos Royal Blue', campusName: 'University of Lagos', primaryLight: '#1A3DFF', primaryDark: '#5D7FFF' },
 { id: 'GLOBAL', label: 'Lioris Teal', campusName: 'Global Workspace', primaryLight: '#0B7A75', primaryDark: '#2DD4BF' },
 { id: 'OAU', label: 'Ife Amber Gold', campusName: 'Obafemi Awolowo University', primaryLight: '#B45309', primaryDark: '#FBBF24' },
 { id: 'FUNAAB', label: 'Abeokuta Emerald', campusName: 'FUNAAB', primaryLight: '#1B7A4B', primaryDark: '#3FAE73' },
 { id: 'ROSE', label: 'Coral Rose', campusName: 'Campus Vibrant', primaryLight: '#BE123C', primaryDark: '#FB7185' },
 { id: 'INDIGO', label: 'Midnight Indigo', campusName: 'Deep Academic', primaryLight: '#4338CA', primaryDark: '#818CF8' },
];
