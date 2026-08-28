import React from 'react';
import { View, Pressable, Platform, StyleSheet } from 'react-native';
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

  if (isDesktop) return null;

  // Filter only visible routes (href !== null)
  const visibleRoutes = state.routes.filter((route: any) => {
    const descriptor = descriptors[route.key];
    if (!descriptor) return false;
    const { options } = descriptor;
    return options.tabBarButton === undefined && (options as any).href !== null;
  });

  return (
    <View style={styles.floatingWrapper} pointerEvents="box-none">
      <View
        style={[
          styles.glassPill,
          {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.28)' : 'rgba(255, 255, 255, 0.20)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.32)' : 'rgba(255, 255, 255, 0.85)',
          },
          Platform.OS === 'web' &&
            ({
              backdropFilter: 'blur(36px) saturate(220%) contrast(108%) brightness(112%)',
              WebkitBackdropFilter: 'blur(36px) saturate(220%) contrast(108%) brightness(112%)',
              boxShadow: isDark
                ? '0 24px 50px rgba(0, 0, 0, 0.75), inset 0 1.5px 2px rgba(255, 255, 255, 0.45)'
                : '0 24px 50px rgba(15, 23, 42, 0.16), inset 0 1.5px 2px rgba(255, 255, 255, 1)',
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
          } else if (route.name.includes('config') || route.name.includes('settings')) {
            iconName = isFocused ? 'settings' : 'settings-outline';
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
                color={isFocused ? '#FFFFFF' : isDark ? '#FFFFFF' : '#0F172A'}
              />
              <AppText
                variant="caption"
                weight={isFocused ? 'bold' : 'semiBold'}
                style={{
                  fontSize: 10,
                  marginTop: 2,
                  color: isFocused ? '#FFFFFF' : isDark ? '#FFFFFF' : '#0F172A',
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
