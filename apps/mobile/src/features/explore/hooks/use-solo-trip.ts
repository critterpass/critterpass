/**
 * SOLO TRIP from a destination: a trip for one that skips the vote and opens setup. Online, setup
 * opens once the server has made the trip (a refusal says so and starts nothing); offline it opens
 * at once and fills in when the trip lands.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { toast } from '@/motion';

import { createTripCommand } from '../commands';
import { useOpOutcome } from '../queries';
import { exploreRoutes } from '../routes';

export interface SoloTrip {
  readonly busy: boolean;
  readonly start: () => void;
}

export function useSoloTrip(input: {
  readonly placeId: string | null;
  readonly placeName: string;
  readonly crewId: string | undefined;
}): SoloTrip {
  const { t } = useLingui();
  const { placeId, placeName, crewId } = input;
  const create = useCommand(createTripCommand);
  const syncPhase = useSyncPhase();
  const [waiting, setWaiting] = useState<{ opId: string; tripId: string } | null>(null);
  const outcome = useOpOutcome(waiting?.opId ?? null);

  const open = useCallback(
    (tripId: string) => {
      const setup = exploreRoutes.tripSetup(tripId);
      if (setup !== undefined) {
        router.replace(setup);
        return;
      }
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `explore-solo-${tripId}`,
        title: t({ id: 'explore.solo.started', message: `Solo trip to ${placeName} started.` }),
      });
      router.back();
    },
    [placeName, t],
  );

  const refuse = useCallback(
    (opId: string) => {
      toast.show({
        id: opId,
        title: t({ id: 'explore.solo.refused', message: "That didn't go through" }),
        subtitle: t({ id: 'explore.solo.refusedBody', message: 'No trip was started. Try again.' }),
      });
    },
    [t],
  );

  const settled = useRef<string | null>(null);
  useEffect(() => {
    if (waiting === null || settled.current === waiting.opId) return;
    if (outcome?.kind === 'rejected') {
      settled.current = waiting.opId;
      refuse(waiting.opId);
    } else if (outcome?.kind === 'applied' || syncPhase === 'offline') {
      settled.current = waiting.opId;
      open(waiting.tripId);
    }
  }, [open, outcome, refuse, syncPhase, waiting]);

  const start = useCallback(() => {
    if (placeId === null) return;
    const tripId = generateUuidV7();
    void create
      .send({
        trip_id: tripId,
        place_id: placeId,
        solo: true,
        ...(crewId === undefined ? {} : { crew_id: crewId }),
      })
      .then((result) => {
        if (result.kind === 'queued') setWaiting({ opId: result.opId, tripId });
        else if (result.kind === 'applied') open(tripId);
        else refuse(result.opId);
      });
  }, [create, crewId, open, placeId, refuse]);

  return {
    busy: create.pending || (waiting !== null && outcome?.kind !== 'rejected'),
    start,
  };
}
