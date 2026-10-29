import React from'react';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';
import { ensureContrast } from'@/theme/contrast';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'critical' | 'inverse' | 'onBrand' | 'onCritical';

interface BadgeProps {
 label: string;
 tone?: BadgeTone;
}

/**
 * Plain colored label - no chip/pill container. A rounded, tinted-background
 * badge around every status word (design directive: no "colour theme pill"
 * anywhere) reads as decorative rather than informative once every label in
 * the app has one. Weight and color alone still carry the same meaning.
 */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
 const { colors } = useTheme();

 const fg: Record<BadgeTone, string> = {
 neutral: colors.textSecondary,
 // For use on a solid brand/critical fill (selected chips), where every other tone would vanish.
 inverse: colors.textInverse,
 // For use on a `brandPrimary` fill (selected chips): navy on the light dark-theme brands, white on the light-theme ones.
 onBrand: colors.onBrand,
 onCritical: colors.onCritical,
 brand: ensureContrast(colors.brandPrimary, colors.surface),
 accent: ensureContrast(colors.brandAccent, colors.surface),
 success: ensureContrast(colors.success, colors.surface),
 warning: ensureContrast(colors.warning, colors.surface),
 critical: ensureContrast(colors.critical, colors.surface),
 };

 return (
 <AppText
 variant="caption"
 weight="bold"
 style={{ color: fg[tone], fontSize: 12, letterSpacing: 0.3, textTransform: 'uppercase' }}
 >
 {label}
 </AppText>
 );
}
