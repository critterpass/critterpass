/**
 * ♡ on a place inside a trip: saved means I back the place's idea in the trip's Ideas. Saving
 * sends `save_idea` (toast "Saved. It's in Ideas."), unsaving leaves the backers with
 * `remove_idea`. Outside a trip the page saves the place to the caller's own list instead.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { toast } from '@/motion';

import { useMyUid } from '../queries';
import { removeIdeaCommand, saveIdeaCommand } from './commands';

export function useIdeaSave(
  tripId: string | null,
  poiId: string | null,
): { readonly saved: boolean; readonly toggle: () => void } {
  const { t } = useLingui();
  const uid = useMyUid();
  const { ideas } = useTripIdeas(tripId);
  const idea = poiId === null ? undefined : ideas.find((entry) => entry.poiId === poiId);
  const saved = idea !== undefined && uid !== null && idea.backerIds.includes(uid);
  const { send: save } = useCommand(saveIdeaCommand);
  const { send: remove } = useCommand(removeIdeaCommand);
  const toggle = useCallback(() => {
    if (tripId === null || poiId === null) return;
    if (saved && idea !== undefined) {
      void remove({ idea_id: idea.id });
      return;
    }
    void save({ idea_id: generateUuidV7(), trip_id: tripId, poi_id: poiId, source: 'save' });
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      id: `place-detail-idea-${poiId}`,
      title: t({ id: 'explore.detail.savedIdea', message: "Saved. It's in Ideas." }),
    });
  }, [idea, poiId, remove, save, saved, t, tripId]);
  return { saved, toggle };
}
