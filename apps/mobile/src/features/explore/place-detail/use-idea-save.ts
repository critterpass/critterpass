/**
 * ♡ on a place inside a trip: saved means I back the place's idea in the trip's Ideas. Saving
 * sends `save_idea`; unsaving takes back only my own save (`remove_idea`), says whether the place
 * stays in Ideas because a crewmate saved it too, and offers UNDO. Taking a place out of Ideas for
 * the whole crew is the organiser's separate, confirmed action (./remove-for-everyone.tsx).
 * Outside a trip the page saves the place to the caller's own list instead.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { toast } from '@/motion';

import { useTripCrew } from '../place-queries';
import { useMyUid } from '../queries';
import { removeIdeaCommand, saveIdeaCommand } from './commands';
import { othersBacking } from './place-facts';

export function useIdeaSave(
  tripId: string | null,
  poiId: string | null,
): { readonly saved: boolean; readonly toggle: () => void } {
  const { t } = useLingui();
  const uid = useMyUid();
  const crew = useTripCrew(tripId);
  const { ideas } = useTripIdeas(tripId);
  const idea = poiId === null ? undefined : ideas.find((entry) => entry.poiId === poiId);
  const saved = idea !== undefined && uid !== null && idea.backerIds.includes(uid);
  const { send: save } = useCommand(saveIdeaCommand);
  const { send: remove } = useCommand(removeIdeaCommand);
  const toggle = useCallback(() => {
    if (tripId === null || poiId === null) return;
    const saveIt = () =>
      void save({ idea_id: generateUuidV7(), trip_id: tripId, poi_id: poiId, source: 'save' });
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
    const id = `place-detail-idea-${poiId}`;
    if (saved && idea !== undefined) {
      void remove({ idea_id: idea.id });
      const others = othersBacking(idea.backerIds, uid, (member) => {
        const name = crew.find((entry) => entry.uid === member)?.name ?? '';
        return name === '' ? null : (name.split(' ')[0] ?? name);
      });
      const first = others.first;
      const more = String(others.count - 1);
      toast.show({
        id,
        title: t({ id: 'explore.detail.unsavedIdea', message: 'Removed from your saves' }),
        ...(others.count === 0
          ? {}
          : {
              subtitle:
                first === null
                  ? t({
                      id: 'explore.detail.stillInIdeas',
                      message: 'Still in Ideas: the crew saved it too',
                    })
                  : others.count === 1
                    ? t({
                        id: 'explore.detail.stillInIdeasOne',
                        message: `Still in Ideas: ${first} saved it too`,
                      })
                    : t({
                        id: 'explore.detail.stillInIdeasMore',
                        message: `Still in Ideas: ${first} and ${more} more saved it too`,
                      }),
            }),
        action: { label: t({ id: 'explore.detail.undo', message: 'Undo' }), onPress: saveIt },
      });
      return;
    }
    saveIt();
    toast.show({ id, title: t({ id: 'explore.detail.savedIdea', message: 'Saved to Ideas' }) });
  }, [crew, idea, poiId, remove, save, saved, t, tripId, uid]);
  return { saved, toggle };
}
