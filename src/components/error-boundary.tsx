import { Component, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { hasError: boolean };

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.box}>
        <Text variant="title">Something went wrong</Text>
        <Text variant="body" color="textSecondary">
          An unexpected error occurred. Please try again.
        </Text>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary caught:', error);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) return <ErrorFallback onRetry={this.reset} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
});
