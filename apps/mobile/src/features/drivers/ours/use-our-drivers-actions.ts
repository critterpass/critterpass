/**
 * Our drivers' actions, shared by both looks: NUDGE marks the invite nudged (once) and reopens
 * WhatsApp with a short nudge for the member to send; CANCEL INVITE switches the link off. Each
 * says how it went and reloads the list.
 */
import { whatsAppLink, type OurDriver } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Linking } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';

import { cancelDriverInviteCommand, nudgeDriverInviteCommand } from './commands';

export function useOurDriversActions(reload: () => void) {
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const nudge = useCommand(nudgeDriverInviteCommand);
  const cancel = useCommand(cancelDriverInviteCommand);
  const [busy, setBusy] = useState<string | null>(null);

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
      const first = shortName(driver.name);
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
    if (cancel.pending) return;
    report(await cancel.send({ invite_id: inviteId }), { id: 'drivers-cancel-invite' });
    reload();
  }

  return {
    busy,
    nudge: (driver: OurDriver, inviteId: string) => void onNudge(driver, inviteId),
    cancel: (inviteId: string) => void onCancel(inviteId),
  };
}
