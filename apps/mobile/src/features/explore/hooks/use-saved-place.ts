/**
 * Saving a destination or a place: `saved` follows the queue first (so a tap shows at once,
 * offline included) and `toggle` sends the save or the unsave, with a toast after a save.
 */
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion';

import { savePlaceCommand, unsavePlaceCommand } from '../commands';
import { useIsSaved, useMyUid, type SavedKind } from '../queries';

export function useSavedPlace(
  refId: string | null,
  kind: SavedKind,
  name: string,
): { readonly saved: boolean; readonly toggle: () => void } {
  const { t } = useLingui();
  const saved = useIsSaved(refId, kind, useMyUid());
  const { send: save } = useCommand(savePlaceCommand);
  const { send: unsave } = useCommand(unsavePlaceCommand);
  const toggle = useCallback(() => {
    if (refId === null) return;
    if (saved) {
      void unsave({ place_id: refId });
      return;
    }
    void save({ place_id: refId });
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      id: `explore-saved-${refId}`,
      title: t({ id: 'explore.save.toast', message: `${name} saved` }),
    });
  }, [refId, saved, save, unsave, name, t]);
  return { saved, toggle };
}
