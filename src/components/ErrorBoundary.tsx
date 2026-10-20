import React from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { reportError, computeFingerprint } from '@/monitoring/errorReporter';
import { useAuth } from '@/auth/AuthContext';

const FAVICON_ASSET = require('../../assets/images/favicon.png');

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error | null;
  errorInfo?: any;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Lioris caught unhandled render error:', error, errorInfo);
    reportError(error, { source: 'ErrorBoundary', componentStack: errorInfo?.componentStack });
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  handleGoLogin = () => {
    this.handleReset();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/login';
    } else {
      router.replace('/(auth)/login' as any);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallbackView
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          showDetails={this.state.showDetails}
          onToggleDetails={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
          onRetry={this.handleReset}
          onGoLogin={this.handleGoLogin}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Functional ErrorBoundary for Expo Router file-based routing.
 * Expo Router looks for this exported signature on route files and _layout.tsx.
 */
export function RouteErrorBoundary(props: { error: Error; retry: () => void }) {
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    reportError(props.error, { source: 'RouteErrorBoundary' });
  }, [props.error]);

  return (
    <ErrorFallbackView
      error={props.error}
      showDetails={showDetails}
      onToggleDetails={() => setShowDetails((prev) => !prev)}
      onRetry={props.retry}
      onGoLogin={() => {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = '/login';
        } else {
          router.replace('/(auth)/login' as any);
        }
      }}
    />
  );
}

interface ErrorFallbackViewProps {
  error?: Error | null;
  errorInfo?: any;
  showDetails: boolean;
  onToggleDetails: () => void;
  onRetry: () => void;
  onGoLogin: () => void;
}

function ErrorFallbackView({
  error,
  errorInfo,
  showDetails,
  onToggleDetails,
  onRetry,
  onGoLogin,
}: ErrorFallbackViewProps) {
  // Technical details are for developers and admins only. useAuth throws outside the provider (the root
  // boundary can render above it), so that case simply means "not an admin".
  let isAdmin = false;
  try {
    isAdmin = useAuth().user?.actualRole === 'admin';
  } catch {
    isAdmin = false;
  }
  const canSeeDetails = __DEV__ || isAdmin;
  // Same fingerprint the error reporter files this error under, so support can find it from the reference.
  const referenceId = React.useMemo(() => {
    try {
      return computeFingerprint(error?.message || 'Error', error?.stack || '').slice(0, 8).toUpperCase();
    } catch {
      return null;
    }
  }, [error]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.emblemWrapper}>
          <Image source={FAVICON_ASSET} style={styles.emblem} resizeMode="contain" />
        </View>

        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>
          {canSeeDetails
            ? error?.message || 'An unexpected issue occurred while rendering this page.'
            : 'An unexpected problem occurred. Please try again. If it keeps happening, contact support.'}
        </Text>
        {referenceId ? (
          <Text style={styles.referenceText} selectable>
            Reference: {referenceId}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.primaryButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>

          <Pressable
            onPress={onGoLogin}
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.secondaryButtonText}>Return to Login</Text>
          </Pressable>
        </View>

        {canSeeDetails ? (
          <Pressable onPress={onToggleDetails} style={styles.detailsToggle}>
            <Text style={styles.detailsToggleText}>
              {showDetails ? 'Hide Error Details ▲' : 'Show Error Details ▼'}
            </Text>
          </Pressable>
        ) : null}

        {canSeeDetails && showDetails && (
          <ScrollView style={styles.detailsBox} nestedScrollEnabled>
            <Text style={styles.detailsText} selectable>
              {error?.stack || error?.message || 'No stack trace available.'}
              {errorInfo?.componentStack ? `\n\nComponent Stack:\n${errorInfo.componentStack}` : ''}
            </Text>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: 'rgba(19, 30, 49, 0.95)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 28,
    alignItems: 'center',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
      } as any,
      default: {},
    }),
  },
  emblemWrapper: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emblem: {
    width: 44,
    height: 44,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  referenceText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: -16,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#2DD4BF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#0B1120',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsToggle: {
    marginTop: 20,
    paddingVertical: 6,
  },
  detailsToggleText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  detailsBox: {
    marginTop: 12,
    maxHeight: 140,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailsText: {
    color: '#F87171',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
  },
});
