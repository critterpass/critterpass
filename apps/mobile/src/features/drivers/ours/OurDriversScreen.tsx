/**
 * Our drivers (6g-3) over the api: NUDGE marks the invite nudged (once) and reopens WhatsApp with a
 * short nudge for the member to send; CANCEL INVITE asks first, then switches the link off. A read
 * that did not come back says so, with a way to try again.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { makeStyles } from '@/ui/theme';

import { LoadFailedScreen } from '../shared/load-failed';
import { driversRoute } from '../shared/routes';
import { OurDriversView } from './OurDriversView';
import { driverRoutes } from './routes';
import { useOurDrivers } from './use-our-drivers';
import { useOurDriversActions } from './use-our-drivers-actions';

const useStyles = makeStyles((t) => ({
  confirm: { paddingHorizontal: t.space['20'], paddingBottom: t.space['24'] },
}));

export function OurDriversScreen({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const { data, offline, failed, reload } = useOurDrivers(tripId);
  const actions = useOurDriversActions(reload);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const backLabel = t({ id: 'drivers.ours.back', message: 'Getting around' });
  const parent = driversRoute(tripId);
  if (data === null) {
    return offline || failed ? (
      <LoadFailedScreen
        backLabel={backLabel}
        fallback={parent}
        offline={offline}
        onRetry={reload}
        testID="drivers-ours-failed"
      />
    ) : (
      <ScreenLoading
        backLabel={backLabel}
        fallback={parent}
        label={t({ id: 'drivers.ours.loading', message: 'Loading your drivers' })}
        testID="drivers-ours-loading"
      />
    );
  }

  const cancelTitle = t({ id: 'drivers.ours.cancelTitle', message: 'Cancel this invite?' });
  return (
    <>
      <OurDriversView
        drivers={data.drivers}
        crewSize={data.crew_size}
        now={new Date()}
        busy={actions.busy}
        onBack={() => goBackOr(parent)}
        onRate={(providerId) => router.push(driverRoutes.rate(tripId, providerId))}
        onInvite={(providerId) => router.push(driverRoutes.invite(tripId, providerId))}
        onNudge={actions.nudge}
        onCancel={setCancelling}
        onDirectory={() => router.push(driverRoutes.directory(tripId))}
      />
      {cancelling === null ? null : (
        <Sheet
          detents={['fit']}
          onDismiss={() => setCancelling(null)}
          accessibilityLabel={cancelTitle}
        >
          <View style={styles.confirm}>
            <ConfirmSheet
              title={cancelTitle}
              consequences={[
                t({
                  id: 'drivers.ours.cancelLine',
                  message: 'The link you sent stops working at once.',
                }),
              ]}
              confirmLabel={t({ id: 'drivers.ours.cancel', message: 'Cancel invite' })}
              onConfirm={() => {
                setCancelling(null);
                actions.cancel(cancelling);
              }}
              onCancel={() => setCancelling(null)}
              testID="drivers-ours-cancel-confirm"
            />
          </View>
        </Sheet>
      )}
    </>
  );
}
