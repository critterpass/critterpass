/** What went wrong in the rooms step, in the premium look's words (the current step's lines). */
import { useLingui } from '@lingui/react/macro';

import type { RoomsNotice } from '../../rooms/rooms-props';

export function useNoticeText(notice: RoomsNotice): string | null {
  const { t } = useLingui();
  switch (notice) {
    case 'conflict':
      return t({
        id: 'setup.rooms.notice.conflict',
        message: 'Someone else just moved people. Here’s the latest.',
      });
    case 'lock_offline':
      return t({ id: 'setup.rooms.notice.offline', message: 'Locking the rooms needs signal.' });
    case 'lock_failed':
      return t({
        id: 'setup.rooms.notice.lockFailed',
        message: 'That didn’t lock. Pick a stay and try again.',
      });
    case 'stay_failed':
      return t({
        id: 'setup.rooms.notice.stayFailed',
        message: 'That stay didn’t go through. Check the dates are locked and try again.',
      });
    case 'stay_unavailable':
      return t({
        id: 'setup.rooms.notice.stayUnavailable',
        message:
          'That stay has no price for this trip right now, so it wasn’t picked. Try another.',
      });
    case null:
      return null;
  }
}
