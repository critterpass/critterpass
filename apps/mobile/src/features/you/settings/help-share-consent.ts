/**
 * The Help share consent as Settings shows it ("Share where I am when I open Help"): the synced
 * `consents` row (purpose `help_auto_share`) with this phone's unsent answer on top. Help asks
 * once and stores the answer; here the traveller can change it either way, and Help then does what
 * it says without asking again.
 */
import type { SetConsentPayload } from '@cp/domain';
import { useCallback, useMemo } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { SET_CONSENT } from '@/lib/location/visits';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { dropPendingEdits, putPendingEdits, usePendingEdits } from '../data/pending-edits';
import {
  HELP_SHARE_SQL,
  HELP_SHARE_TABLES,
  helpShareOn,
  helpSharePayload,
  type ConsentRow,
} from './help-share';

const PENDING_HELP_SHARE = 'help-share';

interface HelpShareAnswer {
  readonly on: boolean;
}

export function useHelpShareConsent(): {
  readonly on: boolean;
  readonly set: (granted: boolean) => void;
} {
  const uid = useOwnerUid();
  const { rows, loaded } = useLiveRows<ConsentRow>(
    HELP_SHARE_SQL,
    uid === null ? null : [uid],
    HELP_SHARE_TABLES,
  );
  const { send } = useCommand<SetConsentPayload>(SET_CONSENT);
  const row = rows[0];
  const stored = useMemo(() => ({ on: helpShareOn(row) }), [row]);
  const on =
    usePendingEdits<HelpShareAnswer>(PENDING_HELP_SHARE, loaded ? stored : null).on ?? stored.on;

  const set = useCallback(
    (granted: boolean) => {
      putPendingEdits<HelpShareAnswer>(PENDING_HELP_SHARE, { on: granted });
      const undo = () => dropPendingEdits<HelpShareAnswer>(PENDING_HELP_SHARE, ['on']);
      void send(helpSharePayload(granted)).then((result) => {
        if (result.kind === 'rejected') undo();
      }, undo);
    },
    [send],
  );
  return { on, set };
}
