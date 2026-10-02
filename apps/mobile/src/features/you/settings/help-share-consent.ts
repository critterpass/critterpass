/**
 * The Help share consent as Settings shows it ("Share where I am when I open Help"): the synced
 * `consents` row (purpose `help_auto_share`) with this screen's unsent answer on top. Help asks
 * once and stores the answer; here the traveller can change it either way, and Help then does what
 * it says without asking again.
 */
import type { SetConsentPayload } from '@cp/domain';
import { useCallback, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { SET_CONSENT } from '@/lib/location/visits';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  HELP_SHARE_SQL,
  HELP_SHARE_TABLES,
  helpShareOn,
  helpSharePayload,
  type ConsentRow,
} from './help-share';

export function useHelpShareConsent(): {
  readonly on: boolean;
  readonly set: (granted: boolean) => void;
} {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<ConsentRow>(
    HELP_SHARE_SQL,
    uid === null ? null : [uid],
    HELP_SHARE_TABLES,
  );
  const { send } = useCommand<SetConsentPayload>(SET_CONSENT);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const on = answer ?? helpShareOn(rows[0]);

  const set = useCallback(
    (granted: boolean) => {
      setAnswer(granted);
      void send(helpSharePayload(granted)).catch(() => setAnswer(null));
    },
    [send],
  );
  return { on, set };
}
