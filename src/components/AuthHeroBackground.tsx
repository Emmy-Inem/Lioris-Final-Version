import React from'react';
import { View } from'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from'react-native-svg';
import { useTheme } from'@/theme/ThemeProvider';

interface AuthHeroBackgroundProps {
 height: number;
 children?: React.ReactNode;
 /** Overrides the default Lioris-teal gradient - used on the register screen to preview the matched university's own brand color live as someone types their school email. */
 fromColor?: string;
 toColor?: string;
 /** Rounds all four corners - lets this double as a hero *card* (e.g. a dashboard welcome banner) rather than only a full-bleed screen band. */
 radius?: number;
}

/**
 * Hero background for auth screens (login/register) - a deep-teal
 * gradient standing in for a real campus photo. UniHub's reference
 * design uses an actual photo of a campus building here; deliberately
 * NOT hotlinking a stock photo URL as a substitute - an unverified
 * remote URL that goes dead in production looks worse than an honest
 * gradient placeholder. Swap the <Svg> below for an
 * <ImageBackground source={{ uri: ... }}> of real branded photography
 * before shipping (see README's"Known follow-ups").
 */
export function AuthHeroBackground({ height, children, fromColor, toColor, radius }: AuthHeroBackgroundProps) {
 const { colors } = useTheme();

 return (
 <View style={{ height, overflow: 'hidden', borderRadius: radius }}>
 <Svg width="100%"height="100%"style={{ position: 'absolute' }}>
 <Defs>
 <LinearGradient id="authHeroGradient"x1="0"y1="0"x2="1"y2="1">
 <Stop offset="0%"stopColor={fromColor ?? colors.brandPrimaryPressed} />
 <Stop offset="100%"stopColor={toColor ?? colors.brandPrimary} />
 </LinearGradient>
 </Defs>
 <Rect x="0"y="0"width="100%"height="100%"fill="url(#authHeroGradient)" />
 </Svg>
 {children}
 </View>
 );
}
