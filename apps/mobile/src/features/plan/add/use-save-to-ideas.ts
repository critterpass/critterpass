/**
 * "Just save it for later": the place goes to the trip's Ideas instead of a day, and a toast names
 * it with the way to see Ideas.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { toast } from '@/motion/island-toast';

import { saveIdeaCommand } from '../ideas/commands';
import { ideasRoute } from '../ideas/routes';
import { seeIdeasLabel } from './add-states-copy';
import type { AddSubject } from './use-add-subject';

export function useSaveToIdeas(tripId: string): (subject: AddSubject) => Promise<void> {
  const { t } = useLingui();
  const saveIdea = useCommand(saveIdeaCommand);
  return useCallback(
    async (subject) => {
      await saveIdea.send({
        idea_id: subject.ideaId ?? generateUuidV7(),
        trip_id: tripId,
        ...(subject.poiId === null
          ? { pin: { name: subject.name, lat: subject.lat, lng: subject.lng } }
          : { poi_id: subject.poiId }),
        source: 'save',
      });
      toast.show({
        id: 'plan-add-saved',
        title: subject.name,
        subtitle: t({ id: 'plan.add.savedToast', message: 'Saved to Ideas' }),
        action: { label: seeIdeasLabel(), onPress: () => router.push(ideasRoute(tripId)) },
      });
    },
    [saveIdea, t, tripId],
  );
}
