import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopTopBar } from './DesktopTopBar';

interface DesktopShellProps {
 children: React.ReactNode;
}

export function DesktopShell({ children }: DesktopShellProps) {
 const { colors } = useTheme();

 return (
 <View style={[styles.rootContainer, { backgroundColor: colors.background }]}>
 {/* Left Navigation Sidebar */}
 <DesktopSidebar />

 {/* Main App Work Area */}
 <View style={styles.mainArea}>
 {/* Sticky Desktop Top Bar */}
 <DesktopTopBar />

 {/* Dynamic Screen View */}
 <View style={styles.contentView}>
 {children}
 </View>
 </View>
 </View>
 );
}

const styles = StyleSheet.create({
 rootContainer: {
 flex: 1,
 flexDirection: 'row',
 width: '100%',
 height: '100%',
 overflow: 'hidden',
 },
 mainArea: {
 flex: 1,
 height: '100%',
 minHeight: 0,
 minWidth: 0,
 display: 'flex',
 flexDirection: 'column',
 overflow: 'hidden',
 },
 contentView: {
 flex: 1,
 height: '100%',
 minHeight: 0,
 minWidth: 0,
 width: '100%',
 overflow: 'hidden',
 },
});
