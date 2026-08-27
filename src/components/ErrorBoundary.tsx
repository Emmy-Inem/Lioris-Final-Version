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
  error?: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: any) {
    console.error('Uncaught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ScreenContainer glow={false}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <AppText variant="h2" weight="bold" style={{ marginBottom: 8, textAlign: 'center' }}>
              Something went wrong
            </AppText>
            <AppText tone="secondary" style={{ textAlign: 'center', marginBottom: 16 }}>
              {this.state.error?.message || 'An unexpected error occurred. Try again, or restart the app if it keeps happening.'}
            </AppText>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <AppButton
                label="Try again"
                onPress={() => this.setState({ hasError: false, error: null })}
              />
              <AppButton
                label="Go to Login"
                variant="secondary"
                onPress={() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/login';
                  } else {
                    this.setState({ hasError: false, error: null });
                  }
                }}
              />
            </View>
          </View>
        </ScreenContainer>
      );
    }
    return this.props.children;
  }
}
