import { Platform } from'react-native';

/**
 * PRD Section 8 (Typography): SF Pro Display on iOS, Inter on Android/Web.
 *
 * SF Pro Display is Apple system property and can't be redistributed via
 * npm/Google Fonts - on iOS we simply use the OS default system font,
 * which *is* SF Pro Display/Text, so no bundled font file is required there.
 * On Android/Web we load Inter explicitly via @expo-google-fonts/inter
 * (see src/theme/useLoadFonts.ts) and reference it by family name below.
 */
export const fontFamily = Platform.select({
 ios: undefined, // undefined -> RN falls back to the system font (SF Pro)
 android: 'Inter_400Regular',
 default: 'Inter_400Regular',
});

export const fontFamilyMedium = Platform.select({
 ios: undefined,
 android: 'Inter_500Medium',
 default: 'Inter_500Medium',
});

export const fontFamilySemiBold = Platform.select({
 ios: undefined,
 android: 'Inter_600SemiBold',
 default: 'Inter_600SemiBold',
});

export const fontFamilyBold = Platform.select({
 ios: undefined,
 android: 'Inter_700Bold',
 default: 'Inter_700Bold',
});

// iOS still benefits from an explicit weight since `undefined` family
// falls back to San Francisco but needs `fontWeight` to pick the right cut.
export const weightForPlatform = {
 regular: Platform.select({ ios: '400', default: undefined }) as
 | '400'
 | undefined,
 medium: Platform.select({ ios: '500', default: undefined }) as
 | '500'
 | undefined,
 semiBold: Platform.select({ ios: '600', default: undefined }) as
 | '600'
 | undefined,
 bold: Platform.select({ ios: '700', default: undefined }) as
 | '700'
 | undefined,
};

export const typeScale = {
 display: { fontSize: 32, lineHeight: 38 },
 h1: { fontSize: 26, lineHeight: 32 },
 h2: { fontSize: 22, lineHeight: 28 },
 h3: { fontSize: 18, lineHeight: 24 },
 body: { fontSize: 15, lineHeight: 22 },
 bodySmall: { fontSize: 13, lineHeight: 18 },
 caption: { fontSize: 11, lineHeight: 14 },
} as const;
