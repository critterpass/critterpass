/**
 * One of the three asks on the permissions page, for the premium page (the current page keeps its
 * own card in `ui/permission-primer`): whether it is on, asking (the page itself is the primer),
 * a refusal that sends the person to Settings, and turning it off (only Settings can).
 */
import { useState } from 'react';

import {
  isSatisfied,
  openPermissionSettings,
  requestWithPrimer,
  usePermission,
  type PermissionKind,
} from '@/lib/permissions';
import { feedback } from '@/motion/feedback';
import { primerCopy, statusLine } from '@/lib/permissions/primer-copy';

export function usePrimerToggle(kind: PermissionKind) {
  const { report } = usePermission(kind);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const on = report !== undefined && isSatisfied(kind, report);

  const ask = async () => {
    feedback.emit('snap');
    if (on) {
      // An OS grant cannot be taken back from inside the app; Settings is where it is turned off.
      await openPermissionSettings(kind);
      return;
    }
    setBusy(true);
    try {
      const outcome = await requestWithPrimer(kind, 'onboarding', { primed: true });
      setRefused(outcome.result === 'denied' || outcome.result === 'settings');
    } finally {
      setBusy(false);
    }
  };

  return {
    /** The card's title and why. */
    copy: primerCopy(kind),
    /** The line a refused card shows. */
    deniedLine: statusLine('denied'),
    on,
    busy,
    /** Said no: the card greys out and offers Settings. */
    refused: refused && !on,
    ask: () => void ask(),
    openSettings: () => void openPermissionSettings(kind),
  };
}
