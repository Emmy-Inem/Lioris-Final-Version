import { useFonts } from '@expo-google-fonts/inter/useFonts';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

// Per-weight imports (not the package barrel) so the web export only bundles
// the four weights we actually use instead of all 18 Inter TTFs (~6 MB).

/**
 * iOS uses the system font (SF Pro) and needs no loading step.
 * Android/Web load Inter here; the root layout blocks rendering
 * (behind the splash screen) until this resolves.
 *
 * If you have a licensed SF Pro Display .ttf, drop it in
 * assets/fonts/ and add it to this same useFonts call under
 * Platform.OS === 'ios'to render true SF Pro Display instead of
 * the system default.
 */
export function useLoadFonts() {
 const [fontsLoaded, fontError] = useFonts({
 Inter_400Regular,
 Inter_500Medium,
 Inter_600SemiBold,
 Inter_700Bold,
 });

 return { fontsLoaded, fontError };
}
