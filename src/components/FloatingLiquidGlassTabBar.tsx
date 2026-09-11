import React, { useEffect, useMemo } from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { haptics } from '@/utils/haptics';

export interface FloatingLiquidGlassTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  insets?: any;
}

function getRouteLabel(route: any, descriptor: any): string {
  const options = descriptor?.options || {};
  if (options.tabBarLabel !== undefined && typeof options.tabBarLabel === 'string') {
    return options.tabBarLabel;
  }
  if (options.title !== undefined && typeof options.title === 'string') {
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
    itemX.value = withSpring(targetX, {
      damping: 22,
      stiffness: 200,
      mass: 0.7,
    });
    itemWidth.value = withSpring(targetWidth, {
      damping: 22,
      stiffness: 200,
      mass: 0.7,
    });

    if (isFocused) {
      labelOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
      labelWidth.value = withSpring(labelWidthEstimate, {
        damping: 22,
        stiffness: 200,
        mass: 0.7,
      });
      labelScale.value = withSpring(1, {
        damping: 22,
        stiffness: 200,
        mass: 0.7,
      });
    } else {
      labelOpacity.value = withTiming(0, {
        duration: 130,
        easing: Easing.in(Easing.quad),
      });
      labelWidth.value = withSpring(0, {
        damping: 22,
        stiffness: 200,
        mass: 0.7,
      });
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

  const iconColor = isFocused ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B';

  return (
    <Animated.View style={[styles.tabItemContainer, animatedContainerStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.tabPressable}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={label}
        hitSlop={4}
      >
        <Ionicons name={iconName} size={19} color={iconColor} />

        <Animated.View style={[styles.labelWrapper, animatedLabelStyle]}>
          <AppText
            variant="caption"
            weight="bold"
            numberOfLines={1}
            style={{
              color: '#FFFFFF',
              fontSize: 12,
              letterSpacing: 0.2,
              paddingLeft: 6,
            }}
          >
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export function FloatingLiquidGlassTabBar({ state, descriptors, navigation }: FloatingLiquidGlassTabBarProps) {
  const { colors, isDark } = useTheme();
  const { isDesktop } = useResponsive();
  const safeAreaInsets = useSafeAreaInsets();

  if (isDesktop) return null;

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

  if (isHiddenRoute) return null;

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
        labels: [],
        icons: [],
      };
    }

    const inactiveWidth = N <= 4 ? 44 : 40;
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
      const lWidth = Math.round(label.length * 8.5) + 12;
      const aWidth = 19 + 6 + 26 + Math.round(label.length * 7.5);

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

    return {
      tabWidths,
      tabPositions,
      labelWidths,
      activeWidth: tabWidths[activeIndex] ?? inactiveWidth,
      selectorX: tabPositions[activeIndex] ?? 0,
      totalContentWidth,
      labels,
      icons,
    };
  }, [visibleRoutes, activeIndex, descriptors]);

  // Animated selector values
  const selectorX = useSharedValue(layoutInfo.selectorX);
  const selectorWidth = useSharedValue(layoutInfo.activeWidth);
  const trackWidth = useSharedValue(layoutInfo.totalContentWidth);

  useEffect(() => {
    selectorX.value = withSpring(layoutInfo.selectorX, {
      damping: 22,
      stiffness: 200,
      mass: 0.7,
    });
    selectorWidth.value = withSpring(layoutInfo.activeWidth, {
      damping: 22,
      stiffness: 200,
      mass: 0.7,
    });
    trackWidth.value = withSpring(layoutInfo.totalContentWidth, {
      damping: 22,
      stiffness: 200,
      mass: 0.7,
    });
  }, [layoutInfo.selectorX, layoutInfo.activeWidth, layoutInfo.totalContentWidth]);

  const animatedSelectorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: selectorX.value }],
    width: selectorWidth.value,
  }));

  const animatedTrackStyle = useAnimatedStyle(() => ({
    width: trackWidth.value,
  }));

  return (
    <View style={[styles.floatingWrapper, { bottom: bottomInset }]} pointerEvents="box-none">
      <View
        {...({ dataSet: { component: 'floating-liquid-glass-bar' } } as any)}
        style={[
          styles.glassPill,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              boxShadow: isDark
                ? '0 12px 30px -4px rgba(0, 0, 0, 0.50)'
                : '0 12px 30px -4px rgba(15, 23, 42, 0.10)',
            } as any),
        ]}
      >
        <Animated.View style={[styles.trackContainer, animatedTrackStyle]}>
          {/* Active Sliding Selector Pill - strictly NO glow */}
          <Animated.View
            style={[
              styles.slidingSelectorPill,
              {
                backgroundColor: colors.brandPrimary,
              },
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
                targetWidth={layoutInfo.tabWidths[index] ?? 40}
                labelWidthEstimate={layoutInfo.labelWidths[index] ?? 80}
                isDark={isDark}
                onPress={onPress}
              />
            );
          })}
        </Animated.View>
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '92%',
    maxWidth: 390,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  trackContainer: {
    position: 'relative',
    height: 44,
    alignSelf: 'center',
  },
  slidingSelectorPill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 44,
    borderRadius: 22,
    zIndex: 1,
    // Strictly NO glow or blurred neon shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabItemContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 44,
    borderRadius: 22,
    zIndex: 2,
  },
  tabPressable: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 22,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
  },
  labelWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
