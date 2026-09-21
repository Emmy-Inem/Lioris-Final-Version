import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';

/**
 * Android needs an explicit blur target: expo-blur's BlurView can only blur the
 * content of a BlurTargetView, and it must live outside that view. Web and iOS
 * blur whatever sits behind them, so on those platforms this host is a plain
 * pass-through and the tab bar keeps rendering inside the navigator as before.
 *
 * On Android the navigator's scenes are wrapped in a BlurTargetView, and the
 * floating tab bar is rendered as a sibling on top of it so it can blur the
 * scrolling screen content underneath.
 */
export interface TabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  insets?: any;
}

interface HostContextValue {
  setBarProps: (props: TabBarProps | null) => void;
}

const HostContext = createContext<HostContextValue | null>(null);

/** Returns the host controls on Android, or null everywhere else. */
export function useBlurredTabsHost(): HostContextValue | null {
  return useContext(HostContext);
}

export function BlurredTabsHost({
  children,
  renderTabBar,
}: {
  children: React.ReactNode;
  renderTabBar: (props: TabBarProps, blurTarget: React.RefObject<View | null>) => React.ReactNode;
}) {
  const blurTarget = useRef<View>(null);
  const [barProps, setBarProps] = useState<TabBarProps | null>(null);
  const value = useMemo(() => ({ setBarProps }), []);

  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }

  return (
    <HostContext.Provider value={value}>
      <View style={styles.fill}>
        <BlurTargetView ref={blurTarget} style={styles.fill}>
          {children}
        </BlurTargetView>
        {barProps ? renderTabBar(barProps, blurTarget) : null}
      </View>
    </HostContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
