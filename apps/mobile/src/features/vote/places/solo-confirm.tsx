/**
 * SOLO TRIP: one confirm before a trip for one. It skips the vote and the RSVP and goes straight to
 * setup with the place's guide; a solo trip can take a Boost but never uses a crew's free first
 * trip, and the confirm says so. Someone in no crew yet gets a crew of one made for it. Online,
 * setup opens once the trip is made, and a refusal shows why; offline, setup opens at once and
 * fills in when the trip lands.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { useOpOutcome } from '../data/use-op-outcome';
import { createTripCommand } from '../data/vote-commands';
import { upper } from '../format';
import { voteRoutes } from '../routes';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['12'],
  },
}));

export function SoloConfirm({
  placeId,
  placeName,
  guideName,
  crewId,
  onCancel,
}: {
  readonly placeId: string;
  readonly placeName: string;
  readonly guideName: string;
  readonly crewId: string | undefined;
  readonly onCancel: () => void;
}) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const create = useCommand(createTripCommand);
  const sync = useSyncStatus();
  const [waiting, setWaiting] = useState<{ opId: string; tripId: string } | null>(null);
  const outcome = useOpOutcome(waiting?.opId ?? null);

  const open = useCallback(
    (tripId: string) => {
      const setup = voteRoutes.tripSetup(tripId);
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
    } else if (outcome?.kind === 'applied' || sync.phase === 'offline') {
      settled.current = waiting.opId;
      open(waiting.tripId);
    }
  }, [open, outcome, refuse, sync.phase, waiting]);
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
  return (
    <Stack style={styles.card} testID="solo-confirm">
      <Text variant="h3">
        {upper(t({ id: 'vote.solo.title', message: `Just you, ${placeName}` }), i18n.locale)}
      </Text>
      <Text variant="body">
        {t({
          id: 'vote.solo.body',
          message: `${guideName} plans it with you. No vote, no RSVP. A solo trip doesn't use a crew's free first trip.`,
        })}
      </Text>
      <PillButton
        label={t({ id: 'vote.solo.start', message: 'Start solo trip' })}
        onPress={() => void start()}
        loading={busy}
        testID="solo-start"
      />
      <TextLink
        label={t({ id: 'vote.solo.cancel', message: 'Not now' })}
        onPress={onCancel}
        testID="solo-cancel"
      />
    </Stack>
  );
}
