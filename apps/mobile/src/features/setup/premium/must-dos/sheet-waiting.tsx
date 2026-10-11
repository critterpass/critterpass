import { useLingui } from '@lingui/react/macro';

import { OverlaySheet } from '@/features/plan';
import { Button, LoadingCritter, Text } from '@/ui/premium';

import type { AddMustDoLook } from '../../must-dos/add-must-do-sheet';

/** Before the trip is read: the sheet with the guide waiting; with no part in the setup, why. */
export function PremiumWaiting(props: Parameters<AddMustDoLook['Waiting']>[0]) {
  const { t } = useLingui();
  return (
    <OverlaySheet
      inRoute
      title={props.title}
      closeLabel={t({ id: 'setup.sheet.close', message: 'Close' })}
      onDismiss={props.onDismiss}
      testID={props.testID}
    >
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
    </OverlaySheet>
  );
}
