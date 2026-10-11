/**
 * "Remove for everyone" (an organiser takes a place out of the trip's Ideas for the whole crew),
 * shared by both looks of the place page. Offered only while a crewmate's save keeps the place in
 * Ideas; the ♡ only ever takes back the organiser's own save.
 */
import { useLingui } from '@lingui/react/macro';

import { useCommand } from '@/data/commands/use-command';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { toast } from '@/motion';

import { useMyUid } from '../queries';
import { removeIdeaCommand } from './commands';

export interface RemoveForEveryoneInput {
  readonly tripId: string | null;
  readonly placeId: string;
  readonly organiser: boolean;
}

export function useRemoveForEveryone({ tripId, placeId, organiser }: RemoveForEveryoneInput) {
  const { t } = useLingui();
  const uid = useMyUid();
  const { ideas } = useTripIdeas(organiser ? tripId : null);
  const { send, pending } = useCommand(removeIdeaCommand);
  const idea = ideas.find((entry) => entry.poiId === placeId);
  const others = idea === undefined ? 0 : idea.backerIds.filter((backer) => backer !== uid).length;
  if (!organiser || idea === undefined || others === 0) return null;
  const remove = () => {
    void send({ idea_id: idea.id, for_everyone: true });
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      id: `place-detail-idea-${placeId}`,
      title: t({ id: 'explore.detail.removeAll.done', message: 'Removed from Ideas for everyone' }),
    });
  };
  return { savers: String(idea.backerIds.length), pending, remove };
}
