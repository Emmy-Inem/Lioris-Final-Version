import React from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
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

  return (
    <View style={[styles.floatingWrapper, { bottom: bottomInset }]} pointerEvents="box-none">
      <View
        {...({ dataSet: { component: 'floating-liquid-glass-bar' } } as any)}
        style={[
          styles.glassPill,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.75)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.95)',
          },
          Platform.OS === 'web' &&
            ({
              background: isDark
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.82) 0%, rgba(15, 23, 42, 0.74) 50%, rgba(15, 23, 42, 0.80) 100%)'
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.72) 50%, rgba(248, 250, 252, 0.78) 100%)',
              backdropFilter: 'blur(18px) saturate(190%) brightness(106%) contrast(104%)',
              WebkitBackdropFilter: 'blur(18px) saturate(190%) brightness(106%) contrast(104%)',
              boxShadow: isDark
                ? '0 20px 48px -8px rgba(0, 0, 0, 0.75), inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.40), inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.12), inset 0 0 12px 1px rgba(255, 255, 255, 0.08)'
                : '0 20px 48px -8px rgba(15, 23, 42, 0.16), inset 0 1.5px 2px 0 rgba(255, 255, 255, 1), inset 0 -1.5px 1.5px 0 rgba(255, 255, 255, 0.35), inset 0 0 12px 1px rgba(255, 255, 255, 0.25)',
            } as any),
        ]}
      >
        {visibleRoutes.map((route: any) => {
          const index = state.routes.findIndex((r: any) => r.key === route.key);
          const isFocused = state.index === index;
          const descriptor = descriptors[route.key];
          const options = descriptor?.options || {};

          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
              ? options.title
              : route.name;

          let iconName: keyof typeof Ionicons.glyphMap = 'cube-outline';
          if (route.name.includes('dashboard') || route.name.includes('home')) {
            iconName = isFocused ? 'home' : 'home-outline';
          } else if (route.name.includes('feed') || route.name.includes('forum')) {
            iconName = isFocused ? 'chatbubbles' : 'chatbubbles-outline';
          } else if (route.name.includes('events')) {
            iconName = isFocused ? 'calendar' : 'calendar-outline';
          } else if (route.name.includes('resources')) {
            iconName = isFocused ? 'folder' : 'folder-outline';
          } else if (route.name.includes('announcements') || route.name.includes('broadcasts')) {
            iconName = isFocused ? 'megaphone' : 'megaphone-outline';
          } else if (route.name.includes('directory')) {
            iconName = isFocused ? 'people' : 'people-outline';
          } else if (route.name.includes('config') || route.name.includes('platform') || route.name.includes('settings')) {
            iconName = isFocused ? 'shield' : 'shield-outline';
          }

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
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[
                styles.tabItem,
                isFocused && {
                  backgroundColor: colors.brandPrimary,
                  borderRadius: 24,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  shadowColor: colors.brandPrimary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.5,
                  shadowRadius: 12,
                  elevation: 8,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={typeof label === 'string' ? label : route.name}
            >
              <Ionicons
                name={iconName}
                size={18}
                color={isFocused ? '#FFFFFF' : isDark ? '#F8FAFC' : '#0F172A'}
              />
              <AppText
                variant="caption"
                weight={isFocused ? 'bold' : 'semiBold'}
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: isFocused ? '#FFFFFF' : isDark ? '#F8FAFC' : '#0F172A',
                }}
              >
                {typeof label === 'string' ? label : route.name}
              </AppText>
            </Pressable>
          );
        })}
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
    justifyContent: 'space-around',
    width: '92%',
    maxWidth: 390,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 20,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginHorizontal: 2,
  },
});
