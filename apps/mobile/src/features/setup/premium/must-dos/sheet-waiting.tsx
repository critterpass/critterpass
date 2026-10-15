import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, LoadingCritter, Text } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { SheetWaitingProps } from '../../shell/frame';

/** Before the trip is read: the sheet with the guide waiting; with no part in the setup, why. */
export function PremiumWaiting(props: SheetWaitingProps) {
  const { t } = useLingui();
  return (
    <SheetScreen
      title={props.title}
      cancelLabel={t({ id: 'setup.premium.cancel', message: 'Cancel' })}
      testID={props.testID}
    >
      <View style={styles.body}>
        {props.state === 'loading' ? (
          <LoadingCritter label={t({ id: 'setup.loading', message: 'Loading trip setup' })} />
        ) : (
          <>
            <Text variant="body" tone="muted">
              {t({
                id: 'setup.sheet.notYours',
                message: 'You’re not part of this trip’s setup, so there’s nothing to do here.',
              })}
            </Text>
            <Button
              variant="secondary"
              label={t({ id: 'setup.sheet.close', message: 'Close' })}
              onPress={props.onDismiss}
              testID={`${props.testID}-close`}
            />
          </>
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({ body: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 } });
