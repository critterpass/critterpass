/**
 * The drafting screen wired to the phone. Arriving from DRAFT MY TRIP it starts the draft, or
 * joins the job already running (another tap, another organiser device), or goes straight to the
 * draft when one is ready. With no signal nothing starts; it tries again once the phone is back
 * online. The job keeps running if the app goes to the background, and its push opens the draft.
 * Only the screen she is looking at moves her on: once she has left the wait for somewhere else
 * (Home, a tab), a draft that lands navigates nothing; she is told and goes there herself, and
 * coming back to the wait then opens the draft.
 */
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { impact } from '@/motion';

import { cancelDraftCommand, startDraftCommand } from '../data/commands';
import { useDraftTrip } from '../data/draft-trip';
import { draftPhase, emptySnapshot, isLive, type StartState } from '../data/job';
import { useDraftServices } from '../data/services';
import { tripDays } from '../data/trip-days';
import { useDraftJob } from '../data/use-draft-job';
import { draftRoutes } from '../routes';
import { DraftingView } from './drafting-view';

/** How long a finished job stays on screen before folding into the draft. */
const DONE_HOLD_MS = 900;
/** A little longer when a step failed on the way, so its reason can be read. */
const PARTIAL_HOLD_MS = 2400;
const TICK_MS = 5000;
const WAITING_STEPS = emptySnapshot('').steps;

function startFailure(detail: unknown): { reason: string | null; jobId: string | null } {
  const record = (detail ?? {}) as { reason?: unknown; job_id?: unknown };
  return {
    reason: typeof record.reason === 'string' ? record.reason : null,
    jobId: typeof record.job_id === 'string' ? record.job_id : null,
  };
}

export function DraftingScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const trip = useDraftTrip(tripId);
  const { network } = useLocalFirst();
  const { now } = useDraftServices();
  const start = useCommand(startDraftCommand);
  const cancel = useCommand(cancelDraftCommand);
  const [startState, setStartState] = useState<StartState>({ kind: 'idle' });
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, loaded } = useDraftJob(tripId, jobId);
  const [clock, setClock] = useState(now);
  const [leaving, setLeaving] = useState(false);
  const decided = useRef(false);
  // A screen that is not on top never navigates.
  const focused = useIsFocused();

  const begin = useCallback(async () => {
    const result = await start.send({ trip_id: tripId });
    if (result.kind === 'applied') {
      const id = (result.result as { job_id?: unknown } | null)?.job_id;
      if (typeof id === 'string') setJobId(id);
      setStartState({ kind: 'idle' });
    } else if (result.kind === 'unavailable' || result.kind === 'queued') {
      setStartState({ kind: 'offline' });
    } else {
      const failure = startFailure(result.detail);
      if (failure.reason === 'draft_running' && failure.jobId !== null) {
        setJobId(failure.jobId);
        setStartState({ kind: 'idle' });
      } else {
        setStartState({ kind: 'rejected', code: result.code, reason: failure.reason });
      }
    }
  }, [start, tripId]);

  // On arrival: join a running job, open a ready draft, or start one. Decided once, on the next
  // tick after the trip and its jobs have loaded.
  useEffect(() => {
    if (decided.current || !focused || trip === undefined || !loaded) return undefined;
    const timer = setTimeout(() => {
      decided.current = true;
      if (trip === null || !trip.isOrganiser) {
        router.replace(draftRoutes.review(tripId));
        return;
      }
      if (isLive(job)) return;
      const ready = trip.status === 'draft_review' || trip.status === 'redrafting';
      if (ready && trip.draftVersionId !== null) router.replace(draftRoutes.review(tripId));
      else void begin();
    }, 0);
    return () => clearTimeout(timer);
  }, [trip, loaded, job, begin, tripId, focused]);

  // No signal: try again once the phone is back online.
  useEffect(() => {
    if (startState.kind !== 'offline') return undefined;
    return network.subscribe((online) => {
      if (online) void begin();
    });
  }, [startState.kind, network, begin]);

  const shownJob = start.pending ? null : job;
  const phase = draftPhase(shownJob, startState, clock);

  useEffect(() => {
    if (phase.kind !== 'running') return undefined;
    const timer = setInterval(() => setClock(now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase.kind, now]);

  const done = phase.kind === 'done';
  const partial = done && phase.partial;
  useEffect(() => {
    if (!done || !focused) return undefined;
    const timer = setTimeout(() => setLeaving(true), partial ? PARTIAL_HOLD_MS : DONE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [done, partial, focused]);

  const onDone = useCallback(() => {
    if (!focused) return;
    impact('success');
    router.replace(draftRoutes.review(tripId));
  }, [tripId, focused]);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(draftRoutes.setup(tripId) ?? '/');
  };

  if (trip === undefined || trip === null) return null;
  return (
    <DraftingView
      guide={trip.guide}
      days={tripDays(trip.startDate, trip.endDate)}
      phase={phase}
      steps={shownJob?.steps ?? WAITING_STEPS}
      dayCards={shownJob?.days ?? []}
      leaving={leaving}
      onDone={onDone}
      onRetry={() => void begin()}
      onCancel={() => void cancel.send({ trip_id: tripId })}
      onBack={onBack}
    />
  );
}
