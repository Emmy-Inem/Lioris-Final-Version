import React from'react';
import { View } from'react-native';
import { AppText } from'./AppText';
import { AppButton } from'./AppButton';
import { ScreenContainer } from'./ScreenContainer';

interface Props {
 children: React.ReactNode;
}

interface State {
 hasError: boolean;
}

/**
 * Root-level safety net. Previously nothing in the app caught render
 * errors, so any component crash would take the whole app down with
 * React Native's default red-screen (dev) or a blank white screen
 * (production) - no recovery path for the user at all. Wraps the root
 * layout; "Try again"just resets local state and re-renders, which is
 * enough to recover from most transient errors (a bad render caused by
 * unexpected data shape, for instance) without forcing a full app
 * restart.
 */
export class ErrorBoundary extends React.Component<Props, State> {
 constructor(props: Props) {
 super(props);
 this.state = { hasError: false };
 }

 static getDerivedStateFromError() {
 return { hasError: true };
 }

 componentDidCatch(error: unknown) {
 // No crash-reporting service wired up yet (see README's"Known
 // follow-ups") - at minimum, this should go to Sentry/Bugsnag/etc.
 // before shipping, so failures are visible without a user filing a
 // bug report.
 console.error('Uncaught render error:', error);
 }

 render() {
 if (this.state.hasError) {
 return (
 <ScreenContainer glow={false}>
 <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
 <AppText variant="h2"weight="bold"style={{ marginBottom: 8, textAlign: 'center' }}>
 Something went wrong
 </AppText>
 <AppText tone="secondary"style={{ textAlign: 'center', marginBottom: 24 }}>
 An unexpected error occurred. Try again, or restart the app if it keeps happening.
 </AppText>
 <AppButton label="Try again"onPress={() => this.setState({ hasError: false })} />
 </View>
 </ScreenContainer>
 );
 }
 return this.props.children;
 }
}
