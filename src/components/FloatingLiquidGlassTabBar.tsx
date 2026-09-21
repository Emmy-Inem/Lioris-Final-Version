import React, { useEffect, useMemo } from 'react';
import { View, Pressable, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { useLiquidGlass } from '@/context/LiquidGlassContext';
import { haptics } from '@/utils/haptics';
import { useBlurredTabsHost } from '@/components/BlurredTabsHost';

export interface FloatingLiquidGlassTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  insets?: any;
}

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 200,
  mass: 0.7,
};

// Android re-lays out the pill every frame while its width animates, and a spring's overshoot
// makes that visibly wobble. A short eased timing curve settles cleanly, so Android uses it and
// web/iOS keep the spring.
const ANDROID_TIMING = { duration: 230, easing: Easing.out(Easing.cubic) };
const animateTo = (value: number) =>
  Platform.OS === 'android' ? withTiming(value, ANDROID_TIMING) : withSpring(value, SPRING_CONFIG);

const PILL_PADDING_H = 6;
const PILL_HEIGHT = 54;
const TAB_HEIGHT = 42;

function getRouteLabel(route: any, descriptor: any): string {
  const options = descriptor?.options || {};
  if (options.tabBarLabel !== undefined && typeof options.tabBarLabel === 'string') {
    return options.tabBarLabel;
  }
  if (options.title !== undefined && typeof options.title === 'string') {
    if (options.title === 'Alumni Events') return 'Events';
    return options.title;
  }
  return route.name;
}

function getRouteIcon(routeName: string, label: string, isFocused: boolean): keyof typeof Ionicons.glyphMap {
  const name = routeName.toLowerCase();
  const lbl = label.toLowerCase();

  if (name.includes('dashboard') || name.includes('home')) {
    if (lbl.includes('overview') || name === 'admin-dashboard') {
      return isFocused ? 'grid' : 'grid-outline';
    }
    return isFocused ? 'home' : 'home-outline';
  }
  if (name.includes('feed') || name.includes('forum')) {
    return isFocused ? 'chatbubbles' : 'chatbubbles-outline';
  }
  if (name.includes('events')) {
    return isFocused ? 'calendar' : 'calendar-outline';
  }
  if (name.includes('resources')) {
    return isFocused ? 'folder' : 'folder-outline';
  }
  if (name.includes('jobs') || name.includes('careers')) {
    return isFocused ? 'briefcase' : 'briefcase-outline';
  }
  if (name.includes('mentorship')) {
    return isFocused ? 'ribbon' : 'ribbon-outline';
  }
  if (name.includes('verification')) {
    return isFocused ? 'checkmark-circle' : 'checkmark-circle-outline';
  }
  if (name.includes('moderation')) {
    return isFocused ? 'shield-checkmark' : 'shield-outline';
  }
  if (name.includes('feature')) {
    return isFocused ? 'options' : 'options-outline';
  }
  if (name.includes('announcements') || name.includes('broadcasts')) {
    return isFocused ? 'megaphone' : 'megaphone-outline';
  }
  if (name.includes('directory')) {
    return isFocused ? 'people' : 'people-outline';
  }
  if (name.includes('config') || name.includes('platform') || name.includes('settings') || lbl.includes('console')) {
    return isFocused ? 'settings' : 'settings-outline';
  }
  if (name.includes('marketplace')) {
    return isFocused ? 'cart' : 'cart-outline';
  }
  if (name.includes('study-group')) {
    return isFocused ? 'library' : 'library-outline';
  }
  return isFocused ? 'ellipse' : 'ellipse-outline';
}

interface TabItemProps {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  isFocused: boolean;
  targetX: number;
  targetWidth: number;
  labelWidthEstimate: number;
  isDark: boolean;
  onPress: () => void;
}

function TabItem({
  label,
  iconName,
  isFocused,
  targetX,
  targetWidth,
  labelWidthEstimate,
  isDark,
  onPress,
}: TabItemProps) {
  const itemX = useSharedValue(targetX);
  const itemWidth = useSharedValue(targetWidth);
  const labelOpacity = useSharedValue(isFocused ? 1 : 0);
  const labelWidth = useSharedValue(isFocused ? labelWidthEstimate : 0);
  const labelScale = useSharedValue(isFocused ? 1 : 0.85);

  useEffect(() => {
    itemX.value = animateTo(targetX);
    itemWidth.value = animateTo(targetWidth);

    if (isFocused) {
      labelOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      labelWidth.value = animateTo(labelWidthEstimate);
      labelScale.value = animateTo(1);
    } else {
      labelOpacity.value = withTiming(0, {
        duration: 130,
        easing: Easing.in(Easing.quad),
      });
      labelWidth.value = animateTo(0);
      labelScale.value = withTiming(0.85, { duration: 130 });
    }
  }, [targetX, targetWidth, isFocused, labelWidthEstimate]);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: itemX.value }],
    width: itemWidth.value,
  }));

  const animatedLabelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
    maxWidth: labelWidth.value,
    transform: [{ scale: labelScale.value }],
  }));

  const iconColor = isFocused ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569';

  return (
    <Animated.View style={[styles.tabItemContainer, animatedContainerStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.tabPressable}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        hitSlop={8}
      >
        <Ionicons name={iconName} size={18} color={iconColor} />

        <Animated.View style={[styles.labelWrapper, animatedLabelStyle]}>
          <AppText
            variant="caption"
            weight="bold"
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              letterSpacing: 0.2,
              paddingLeft: 6,
              ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
            }}
          >
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function FloatingLiquidGlassTabBarView({
  state,
  descriptors,
  navigation,
  blurTarget,
}: FloatingLiquidGlassTabBarProps & { blurTarget?: React.RefObject<View | null> }) {
  const { colors, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const { settings, getGlassBackground, getGlassBorderColor, getBackdropFilterString } = useLiquidGlass();

  // Active route
  const currentRoute = state.routes[state.index];
  const currentDescriptor = descriptors[currentRoute?.key];
  const currentOptions = currentDescriptor?.options || {};

  // Suppress floating tab bar on detail/child routes or when explicitly hidden
  const isHiddenRoute =
    currentOptions.tabBarStyle?.display === 'none' ||
    currentRoute?.name?.includes('[id]') ||
    currentRoute?.name?.includes('detail') ||
    currentRoute?.name?.includes('chat') ||
    currentRoute?.name === 'messages' ||
    currentRoute?.name?.startsWith('messages/');

  // Filter only visible routes (href !== null)
  const visibleRoutes = state.routes.filter((route: any) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return false;
    const { options } = descriptor;
    return options.tabBarButton === undefined && (options as any).href !== null;
  });

  const bottomInset = Platform.OS === 'web' ? 18 : Math.max(18, (safeAreaInsets?.bottom ?? 0) + 6);

  const activeRoute = state.routes[state.index];
  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((r: any) => r.key === activeRoute?.key)
  );

  const layoutInfo = useMemo(() => {
    const N = visibleRoutes.length;
    if (N === 0) {
      return {
        tabWidths: [],
        tabPositions: [],
        labelWidths: [],
        activeWidth: 0,
        selectorX: 0,
        totalContentWidth: 0,
        targetPillWidth: 0,
        labels: [],
        icons: [],
      };
    }

    const inactiveWidth = 42;
    const gap = 6;

    const labels: string[] = [];
    const icons: Array<keyof typeof Ionicons.glyphMap> = [];
    const labelWidths: number[] = [];
    const activeWidths: number[] = [];

    visibleRoutes.forEach((route: any, i: number) => {
      const descriptor = descriptors[route.key];
      const label = getRouteLabel(route, descriptor);
      const isFocused = i === activeIndex;
      const icon = getRouteIcon(route.name, label, isFocused);
      const lWidth = Math.round(label.length * 7.5) + 12;
      // Active width: 18px icon + 6px text padding + 24px container padding (12 left + 12 right) + text width
      const aWidth = 18 + 6 + 24 + Math.round(label.length * 7.5);

      labels.push(label);
      icons.push(icon);
      labelWidths.push(lWidth);
      activeWidths.push(aWidth);
    });

    const tabWidths: number[] = [];
    const tabPositions: number[] = [];
    let currentX = 0;

    for (let i = 0; i < N; i++) {
      const isAct = i === activeIndex;
      const w = isAct ? activeWidths[i] : inactiveWidth;
      tabWidths.push(w);
      tabPositions.push(currentX);
      currentX += w + gap;
    }

    const totalContentWidth = currentX - gap;
    // The navigation pill size adjusts dynamically to snugly hug the tabs with 6px padding on both sides
    const maxPillWidth = Math.min(windowWidth - 24, 380);
    const targetPillWidth = Math.min(totalContentWidth + PILL_PADDING_H * 2, maxPillWidth);

    return {
      tabWidths,
      tabPositions,
      labelWidths,
      activeWidth: tabWidths[activeIndex] ?? inactiveWidth,
      selectorX: tabPositions[activeIndex] ?? 0,
      totalContentWidth,
      targetPillWidth,
      labels,
      icons,
    };
  }, [visibleRoutes, activeIndex, descriptors, windowWidth]);

  // Animated shared values
  const pillWidth = useSharedValue(layoutInfo.targetPillWidth);
  const selectorX = useSharedValue(layoutInfo.selectorX);
  const selectorWidth = useSharedValue(layoutInfo.activeWidth);
  const trackWidth = useSharedValue(layoutInfo.totalContentWidth);

  useEffect(() => {
    pillWidth.value = animateTo(layoutInfo.targetPillWidth);
    selectorX.value = animateTo(layoutInfo.selectorX);
    selectorWidth.value = animateTo(layoutInfo.activeWidth);
    trackWidth.value = animateTo(layoutInfo.totalContentWidth);
  }, [layoutInfo.targetPillWidth, layoutInfo.selectorX, layoutInfo.activeWidth, layoutInfo.totalContentWidth]);

  const animatedPillStyle = useAnimatedStyle(() => ({
    width: pillWidth.value,
  }));

  const animatedSelectorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selectorX.value }],
    width: selectorWidth.value,
  }));

  const animatedTrackStyle = useAnimatedStyle(() => ({
    width: trackWidth.value,
  }));

  if (isDesktop || isHiddenRoute || visibleRoutes.length === 0) {
    return null;
  }

  return (
    <View
      style={[styles.floatingWrapper, { bottom: bottomInset }]}
      pointerEvents="box-none"
      accessibilityRole="tablist"
      accessibilityLabel="Main navigation"
    >
      <Animated.View
        {...({ dataSet: { component: 'floating-liquid-glass-bar' } } as any)}
        style={[
          styles.glassPill,
          animatedPillStyle,
          {
            backgroundColor: getGlassBackground(isDark),
            borderColor: getGlassBorderColor(isDark),
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: getBackdropFilterString(),
              WebkitBackdropFilter: getBackdropFilterString(),
              boxShadow: isDark
                ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08), 0 4px 20px -2px rgba(0, 0, 0, 0.35)'
                : 'inset 0 1px 0 0 rgba(255, 255, 255, 0.80), 0 4px 20px -2px rgba(15, 23, 42, 0.06)',
            } as any),
        ]}
      >
        {/* Native Liquid Blur Engine */}
        {Platform.OS !== 'web' && (Platform.OS !== 'android' || blurTarget) && (
          <BlurView
            intensity={Math.round(settings.blurIntensity * 3.2)}
            tint={isDark ? 'dark' : 'light'}
            blurTarget={blurTarget}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={[StyleSheet.absoluteFill, { borderRadius: PILL_HEIGHT / 2, overflow: 'hidden' }]}
          />
        )}

        {/* Liquid Surface Meniscus Reflection Overlay - only in light mode to avoid dark mode white glow */}
        {!isDark && (
          <LinearGradient
            colors={[`rgba(255, 255, 255, ${settings.specularShine})`, `rgba(255, 255, 255, ${(settings.specularShine * 0.25).toFixed(2)})`, 'transparent']}
            locations={[0, 0.3, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: PILL_HEIGHT / 2, overflow: 'hidden' }]}
            pointerEvents="none"
          />
        )}

        <Animated.View style={[styles.trackContainer, animatedTrackStyle]}>
          {/* Active Sliding Selector Pill - strictly NO glow */}
          <Animated.View
            style={[
              styles.slidingSelectorPill,
              {
                backgroundColor: colors.brandPrimary,
              },
              Platform.OS === 'web' &&
                ({
                  boxShadow: 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.35), 0 3px 10px rgba(0, 0, 0, 0.18)',
                } as any),
              animatedSelectorStyle,
            ]}
          />

          {/* Interactive Tab Buttons */}
          {visibleRoutes.map((route: any, index: number) => {
            const isFocused = index === activeIndex;

            const onPress = () => {
              haptics.light();
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TabItem
                key={route.key}
                label={layoutInfo.labels[index] || route.name}
                iconName={layoutInfo.icons[index] || 'ellipse-outline'}
                isFocused={isFocused}
                targetX={layoutInfo.tabPositions[index] ?? 0}
                targetWidth={layoutInfo.tabWidths[index] ?? 42}
                labelWidthEstimate={layoutInfo.labelWidths[index] ?? 80}
                isDark={isDark}
                onPress={onPress}
              />
            );
          })}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
    bottom: Platform.OS === 'web' ? 18 : 22,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  glassPill: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 1,
    paddingHorizontal: PILL_PADDING_H,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 0,
  },
  trackContainer: {
    position: 'relative',
    height: TAB_HEIGHT,
    alignSelf: 'center',
    zIndex: 2,
  },
  slidingSelectorPill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: TAB_HEIGHT,
    borderRadius: TAB_HEIGHT / 2,
    zIndex: 1,
    // Strictly NO glow or blurred neon shadows - crisp physical depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 0,
  },
  tabItemContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: TAB_HEIGHT,
    borderRadius: TAB_HEIGHT / 2,
    zIndex: 2,
  },
  tabPressable: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: TAB_HEIGHT / 2,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  labelWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
});


/**
 * Entry point used by the navigators. On Android the bar is handed to
 * BlurredTabsHost, which renders it outside the blur target; everywhere else it
 * renders in place exactly as before.
 */
export function FloatingLiquidGlassTabBar(props: FloatingLiquidGlassTabBarProps) {
  const host = useBlurredTabsHost();
  const setBarProps = host?.setBarProps;

  useEffect(() => {
    setBarProps?.(props);
  });

  useEffect(() => () => setBarProps?.(null), [setBarProps]);

  if (host) return null;
  return <FloatingLiquidGlassTabBarView {...props} />;
}

export { FloatingLiquidGlassTabBarView };
