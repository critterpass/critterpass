import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/ui/premium';
import { confirmAlert, HoldToConfirm, PushScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

/** Push screen: inline title + subtitle, one right action, the alert and the hold to confirm. */
export default function DemoPush() {
  const [result, setResult] = useState('Nothing confirmed yet');
  return (
    <PushScreen
      title="Trip settings"
      subtitle="Bali · Oct 12–19"
      backLabel="Back"
      testID="premium-shell-push"
      action={{
        key: 'share',
        label: 'Share',
        sfSymbol: 'square.and.arrow.up',
        glyph: 'share',
        onPress: () => router.push('/(dev)/premium-shell/full'),
      }}
    >
      <View style={styles.body}>
        <Text variant="display">Cancel Kyoto?</Text>
        <Text variant="emptyLine" tone="muted">
          Here's exactly what happens. Nothing's gone until you hold the button.
        </Text>
        <Text variant="label" tone="muted" testID="premium-shell-push-result">
          {result}
        </Text>
        <HoldToConfirm
          label="Hold to cancel Kyoto"
          testID="premium-shell-hold"
          onConfirm={() => setResult('Held: trip cancelled')}
          fallback={{
            title: 'Cancel Kyoto?',
            message: 'The crew is told and the trip moves to Past.',
            confirm: 'Cancel trip',
            cancel: 'Keep the trip',
          }}
        />
        <Button
          label="Ask with an alert"
          variant="secondary"
          testID="premium-shell-alert"
          onPress={() =>
            void confirmAlert({
              title: 'Remove Ana from the trip?',
              message: 'She keeps her own bookings.',
              confirm: 'Remove',
              cancel: 'Cancel',
            }).then((yes) => setResult(yes ? 'Removed' : 'Kept'))
          }
        />
        <Button label="Keep the trip" testID="premium-shell-keep" onPress={() => router.back()} />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({ body: { padding: 24, gap: 12 } });
