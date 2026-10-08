/**
 * Our drivers (6g-3) over the api: NUDGE marks the invite nudged (once) and reopens WhatsApp with a
 * short nudge for the member to send; CANCEL INVITE asks first, then switches the link off. A read
 * that did not come back says so, with a way to try again.
 */
import { whatsAppLink, type OurDriver } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { makeStyles } from '@/ui/theme';

import { LoadFailedScreen } from '../shared/load-failed';
import { driversRoute } from '../shared/routes';
import { cancelDriverInviteCommand, nudgeDriverInviteCommand } from './commands';
import { OurDriversView } from './OurDriversView';
import { driverRoutes } from './routes';
import { useOurDrivers } from './use-our-drivers';

const useStyles = makeStyles((t) => ({
  confirm: { paddingHorizontal: t.space['20'], paddingBottom: t.space['24'] },
}));

export function OurDriversScreen({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const styles = useStyles();
  const { data, offline, failed, reload } = useOurDrivers(tripId);
  const { report } = useCommandFeedback();
  const nudge = useCommand(nudgeDriverInviteCommand);
  const cancel = useCommand(cancelDriverInviteCommand);
  const [busy, setBusy] = useState<string | null>(null);
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

  async function onNudge(driver: OurDriver, inviteId: string) {
    if (busy !== null) return;
    setBusy(driver.provider_id);
    const result = await nudge.send({ invite_id: inviteId });
    setBusy(null);
    report(result, {
      id: 'drivers-nudge',
      refused: t({ id: 'drivers.ours.nudgeUsed', message: 'You already nudged him once.' }),
    });
    if (result.kind === 'applied') {
      const { phone_e164 } = result.result as { phone_e164: string };
      const first = driver.name.split(' ')[0] ?? driver.name;
      void Linking.openURL(
        whatsAppLink(
          phone_e164,
          // The nudge goes to the driver in English, like the invite.
          // eslint-disable-next-line lingui/no-unlocalized-strings
          `Hi ${first}, just checking you saw our message about being listed. No pressure at all!`,
        ),
      );
    }
    reload();
  }

  async function onCancel(inviteId: string) {
    setCancelling(null);
    if (cancel.pending) return;
    report(await cancel.send({ invite_id: inviteId }), { id: 'drivers-cancel-invite' });
    reload();
  }

  const cancelTitle = t({ id: 'drivers.ours.cancelTitle', message: 'Cancel this invite?' });
  return (
    <>
      <OurDriversView
        drivers={data.drivers}
        crewSize={data.crew_size}
        now={new Date()}
        busy={busy}
        onBack={() => goBackOr(parent)}
        onRate={(providerId) => router.push(driverRoutes.rate(tripId, providerId))}
        onInvite={(providerId) => router.push(driverRoutes.invite(tripId, providerId))}
        onNudge={(driver, inviteId) => void onNudge(driver, inviteId)}
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
              onConfirm={() => void onCancel(cancelling)}
              onCancel={() => setCancelling(null)}
              testID="drivers-ours-cancel-confirm"
            />
          </View>
        </Sheet>
      )}
    </>
  );
}
