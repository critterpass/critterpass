/**
 * Our drivers (6g-3) over the api: NUDGE marks the invite nudged (once) and reopens WhatsApp with a
 * short nudge for the member to send; CANCEL INVITE switches the link off at once.
 */
import { whatsAppLink, type OurDriver } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { feedback, toast } from '@/motion';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

import { cancelDriverInviteCommand, nudgeDriverInviteCommand } from './commands';
import { OurDriversView } from './OurDriversView';
import { driverRoutes } from './routes';
import { useOurDrivers } from './use-our-drivers';

export function OurDriversScreen({ tripId }: { readonly tripId: string }) {
  const { t } = useLingui();
  const { data, reload } = useOurDrivers(tripId);
  const nudge = useCommand(nudgeDriverInviteCommand);
  const cancel = useCommand(cancelDriverInviteCommand);
  const [busy, setBusy] = useState<string | null>(null);
  if (data === null) return <SessionWaiting testID="drivers-ours-loading" />;

  async function onNudge(driver: OurDriver, inviteId: string) {
    setBusy(driver.provider_id);
    const result = await nudge.send({ invite_id: inviteId });
    setBusy(null);
    if (result.kind === 'rejected') {
      feedback.emit('error');
      toast.show({
        id: 'drivers-nudge',
        title: t({ id: 'drivers.ours.nudgeUsed', message: 'You already nudged him once.' }),
      });
      return;
    }
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
    const result = await cancel.send({ invite_id: inviteId });
    if (result.kind === 'rejected') feedback.emit('error');
    reload();
  }

  return (
    <OurDriversView
      drivers={data.drivers}
      crewSize={data.crew_size}
      now={new Date()}
      busy={busy}
      onBack={() => router.back()}
      onRate={(providerId) => router.push(driverRoutes.rate(tripId, providerId))}
      onInvite={(providerId) => router.push(driverRoutes.invite(tripId, providerId))}
      onNudge={(driver, inviteId) => void onNudge(driver, inviteId)}
      onCancel={(inviteId) => void onCancel(inviteId)}
      onDirectory={() => router.push(driverRoutes.directory(tripId))}
    />
  );
}
