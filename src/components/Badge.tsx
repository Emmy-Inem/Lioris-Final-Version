import React from'react';
import { useTheme } from'@/theme/ThemeProvider';
import { AppText } from'./AppText';

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'critical';

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
 brand: colors.brandPrimary,
 accent: colors.brandAccent,
 success: colors.success,
 warning: colors.warning,
 critical: colors.critical,
 };

 return (
 <AppText
 variant="caption"
 weight="bold"
 style={{ color: fg[tone], fontSize: 10.5, letterSpacing: 0.3, textTransform: 'uppercase' }}
 >
 {label}
 </AppText>
 );
}
