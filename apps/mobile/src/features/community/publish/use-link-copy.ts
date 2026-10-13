import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';

import { useCommand } from '@/data/commands/use-command';
import { useCommandFeedback } from '@/motion/island-toast';

import { createPlanLink } from '../commands';
import { toastIds } from '../ids';

/** Makes a read-only link to the trip's shared plan and copies it. */
export function useLinkCopy(tripId: string) {
  const { t } = useLingui();
  const { send } = useCommand(createPlanLink);
  const { report } = useCommandFeedback();
  return async () => {
    const result = await send({ trip_id: tripId });
    if (result.kind === 'applied') {
      await Clipboard.setStringAsync((result.result as { url: string }).url);
    }
    report(result, {
      id: toastIds.link(tripId),
      done: t({ id: 'community.publish.linkCopied', message: 'Read-only link copied.' }),
    });
  };
}
