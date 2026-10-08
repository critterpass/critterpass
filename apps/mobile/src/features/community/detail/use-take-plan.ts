/**
 * Taking a shared plan into a trip: an organiser copies it (the server places it at once, so it
 * needs signal), anyone else suggests it to their organiser (kept on the phone when offline). With
 * no trip yet, a new solo trip to the plan's destination is started first and the plan copied into
 * it. One action at a time: `busy` covers every button that takes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and toast ids, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { useCommandFeedback } from '@/motion/island-toast';

import { copySharedPlan, suggestSharedPlan, type CopyPayload } from '../commands';
import { DRAFT_REVIEW_SCREEN, toastIds, TRIP_SETUP_SCREEN } from '../ids';

export interface TakeTarget {
  readonly tripId: string;
  readonly organiser: boolean;
}

/** The trip-creation command (the vote area's `create_trip`), for a solo trip to one place. */
const createTrip = defineClientCommand<{
  readonly trip_id: string;
  readonly place_id: string;
  readonly solo: true;
}>({
  name: 'create_trip',
  offline: true,
  summarize: () => msg({ id: 'community.queued.trip', message: 'Your new trip' }),
});

const OUTCOME_SQL = `SELECT (SELECT count(*) FROM commands WHERE id = ?) AS queued,
    (SELECT code FROM rejected_commands WHERE id = ?) AS code`;
const POLL_MS = 400;
const WAIT_MS = 20_000;

type Db = ReturnType<typeof useLocalFirst>['db'];

/** Whether queued command `opId` reached the server: true applied, false refused or not in time. */
async function landed(db: Db, opId: string): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    const row = (
      await db.getAll<{ queued: number; code: string | null }>(OUTCOME_SQL, [opId, opId])
    )[0];
    if (row !== undefined && row.code !== null) return false;
    if (row !== undefined && Number(row.queued) === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return false;
}

export function useTakePlan(input: {
  readonly sharedPlanId: string;
  readonly guideName: string;
  readonly onChanged: () => void;
}) {
  const { t } = useLingui();
  const router = useRouter();
  const { db, network } = useLocalFirst();
  const { report } = useCommandFeedback();
  const { send: copy } = useCommand(copySharedPlan);
  const { send: suggest } = useCommand(suggestSharedPlan);
  const { send: create } = useCommand(createTrip);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const id = input.sharedPlanId;

  const once = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const copyInto = async (tripId: string, dayNos: readonly number[] | undefined) => {
    const payload: CopyPayload =
      dayNos === undefined
        ? { shared_plan_id: id, trip_id: tripId }
        : { shared_plan_id: id, trip_id: tripId, days: dayNos };
    const result = await copy(payload);
    const places =
      result.kind === 'applied' ? ((result.result as { places?: number }).places ?? 0) : 0;
    const name = input.guideName;
    const outcome = report(result, {
      id: toastIds.copied(id),
      done: t({
        id: 'community.detail.copied',
        message: `${name} is fitting ${places} places into your draft. Only you can see it.`,
      }),
      refused: t({
        id: 'community.detail.copyFailed',
        message: "That didn't go through. Try again in a moment.",
      }),
    });
    if (outcome === 'done') input.onChanged();
    return outcome === 'done';
  };

  /** Copy (organiser) or suggest (anyone else) the plan, or just `dayNos` of it, into a trip. */
  const take = (target: TakeTarget, dayNos?: readonly number[]) =>
    once(async () => {
      if (!target.organiser) {
        const payload: CopyPayload =
          dayNos === undefined
            ? { shared_plan_id: id, trip_id: target.tripId }
            : { shared_plan_id: id, trip_id: target.tripId, days: dayNos };
        const result = await suggest(payload);
        report(result, {
          id: toastIds.suggested(id),
          offlineCapable: true,
          done:
            result.kind === 'queued'
              ? t({
                  id: 'community.detail.suggestQueued',
                  message: 'Saved. Your organiser gets it when you have signal.',
                })
              : t({ id: 'community.detail.suggested', message: 'Sent to your organiser.' }),
        });
        return;
      }
      if (!(await copyInto(target.tripId, dayNos))) return;
      const href = hrefFor(DRAFT_REVIEW_SCREEN, { tripId: target.tripId });
      if (href !== undefined) router.push(href);
    });

  /** A new solo trip to the plan's destination, with the plan copied in; then its setup opens. */
  const startTrip = (destinationId: string) =>
    once(async () => {
      const unavailable = { kind: 'unavailable' } as const;
      // The copy needs the server, so nothing is started with no signal.
      if (!network.isOnline()) {
        report(unavailable, { id: toastIds.copied(id) });
        return;
      }
      const tripId = generateUuidV7();
      const made = await create({ trip_id: tripId, place_id: destinationId, solo: true });
      const there =
        made.kind === 'applied' || (made.kind === 'queued' && (await landed(db, made.opId)));
      if (!there) {
        report(made.kind === 'rejected' ? made : unavailable, {
          id: toastIds.copied(id),
          refused: t({
            id: 'community.detail.tripFailed',
            message: "The trip didn't start. Try again in a moment.",
          }),
        });
        return;
      }
      await copyInto(tripId, undefined);
      const href = hrefFor(TRIP_SETUP_SCREEN, { tripId });
      if (href !== undefined) router.push(href);
    });

  return { busy, take, startTrip };
}
