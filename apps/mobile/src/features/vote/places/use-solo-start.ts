import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { toast } from '@/motion';
import { useOpOutcome } from '../data/use-op-outcome';
import { createTripCommand } from '../data/vote-commands';
import { voteRoutes } from '../routes';

/**
 * Starting a solo trip: online, setup opens once the server has made the trip (a
 * refusal says why); offline it opens at once and fills in when the trip lands.
 */
export function useSoloStart({
  placeId,
  placeName,
  crewId,
}: {
  readonly placeId: string;
  readonly placeName: string;
  readonly crewId: string | undefined;
}) {
  const { t } = useLingui();
  const create = useCommand(createTripCommand);
  const syncPhase = useSyncPhase();
  const [waiting, setWaiting] = useState<{ opId: string; tripId: string } | null>(null);
  const outcome = useOpOutcome(waiting?.opId ?? null);

  const open = useCallback(
    (tripId: string) => {
      const setup = voteRoutes.tripStart(tripId);
      if (setup !== undefined) {
        router.replace(setup);
        return;
      }
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `solo-${tripId}`,
        title: t({ id: 'vote.solo.started', message: `Solo trip to ${placeName} started.` }),
      });
      router.back();
    },
    [placeName, t],
  );

  const refuse = useCallback(
    (opId: string) => {
      toast.show({
        id: opId,
        title: t({ id: 'vote.solo.refused', message: "That didn't go through" }),
        subtitle: t({ id: 'vote.solo.refusedBody', message: 'No trip was started. Try again.' }),
      });
    },
    [t],
  );

  // Online, the trip opens once the server has made it (or says why not); offline it opens at once
  // and setup fills in when the trip lands.
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
  const busy = create.pending || (waiting !== null && outcome?.kind !== 'rejected');

  const start = async () => {
    const tripId = generateUuidV7();
    const result = await create.send({
      trip_id: tripId,
      place_id: placeId,
      solo: true,
      ...(crewId === undefined ? {} : { crew_id: crewId }),
    });
    if (result.kind === 'rejected') refuse(result.opId);
    else if (result.kind === 'queued') setWaiting({ opId: result.opId, tripId });
    else if (result.kind === 'applied') open(tripId);
  };
  return { start, busy };
}
