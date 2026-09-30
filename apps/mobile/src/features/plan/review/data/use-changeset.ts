/**
 * `useChangeset(tripId, changesetId)`: one change set as every approval surface reads it (the
 * review screen, the chat card, later the proposal and guide chat flows): its cards against the
 * version it was made on, the vote's tally, the yeses sending will need, and the review numbers
 * (cost per person, bookings moved, must-dos touched). `useChangesetActions` holds the writes:
 * keep or drop a change, send it, apply it to my plan only, approve or reject it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useContext, useMemo } from 'react';

import { changeSetOpsSchema, type ChangeSetOp } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';
import type { ClientCommandSpec } from '@/data/commands/summaries';
import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { useLiveRows } from '../../overview/data/live-rows';
import {
  DAYS_SQL,
  DAYS_TABLES,
  ITEMS_SQL,
  ITEMS_TABLES,
  idArray,
  jsonArray,
  type PlanDayRow,
  type PlanItemRow,
} from '../../overview/data/plan-rows';
import { usePlanData, type PlanData } from '../../overview/data/use-plan-data';
import {
  toPlanDays,
  toPlanItems,
  type PlanDay,
  type PlanItem,
} from '../../overview/model/plan-model';
import {
  buildChangeCards,
  changesetState,
  predictDecider,
  tallyOf,
  withToggles,
  type ChangeCard,
  type ChangesetState,
  type DeciderPrediction,
  type Tally,
} from '../model/review-model';
import { reviewNumbers, type ReviewNumbers } from '../model/review-numbers';
import {
  APPLY_CHANGESET,
  APPROVE_CHANGESET,
  SEND_CHANGESET,
  SET_CHANGESET_ITEM,
} from './changeset-commands';

export interface ChangesetRow {
  readonly id: string;
  readonly trip_id: string;
  readonly base_version_id: string;
  readonly trigger: string | null;
  readonly scope: string | null;
  readonly author_kind: string | null;
  readonly author_id: string | null;
  readonly status: string;
  readonly poll_id: string | null;
  readonly cost_delta_minor: number | null;
  readonly ops: string | null;
}

const CHANGESET_SQL = `SELECT id, trip_id, base_version_id, trigger, scope, author_kind, author_id,
    status, poll_id, cost_delta_minor, ops
  FROM change_sets WHERE id = ?`;

interface PollRow {
  readonly id: string;
  readonly status: string;
  readonly decider_policy: string | null;
  readonly threshold: number | null;
  readonly eligible_voter_ids: string | null;
  readonly closes_at: string | null;
  readonly close_reason: string | null;
}

const POLL_SQL = `SELECT id, status, decider_policy, threshold, eligible_voter_ids, closes_at,
    close_reason FROM polls WHERE id = ?`;
const BALLOTS_SQL = `SELECT b.user_id, o.position FROM ballots b
  JOIN poll_options o ON o.id = b.option_id WHERE b.poll_id = ?`;
const POIS_SQL = 'SELECT id, name FROM pois WHERE id IN (SELECT value FROM json_each(?))';

/** Queued `set_changeset_item` toggles for this change set, newest last (shown before they sync). */
const TOGGLES_SQL = `SELECT envelope FROM commands
  WHERE cmd = 'set_changeset_item' AND status <> 'done'
    AND json_extract(envelope, '$.payload.changeset_id') = ?
  ORDER BY seq`;

export interface ChangesetView {
  readonly status: 'loading' | 'missing' | 'ready';
  readonly row: ChangesetRow | null;
  readonly plan: PlanData;
  readonly state: ChangesetState;
  readonly mine: boolean;
  readonly cards: readonly ChangeCard[];
  readonly days: readonly PlanDay[];
  readonly baseItems: readonly PlanItem[];
  readonly prediction: DeciderPrediction;
  readonly tally: Tally | null;
  readonly closesAt: string | null;
  readonly numbers: ReviewNumbers | null;
}

function parseOps(value: string | null): ChangeSetOp[] {
  const parsed = changeSetOpsSchema.safeParse(jsonArray<unknown>(value));
  return parsed.success ? parsed.data : [];
}

export function useChangeset(tripId: string | null, changesetId: string | null): ChangesetView {
  const plan = usePlanData(tripId);
  const rows = useLiveRows<ChangesetRow>(
    CHANGESET_SQL,
    changesetId === null ? null : [changesetId],
    ['change_sets'],
  );
  const row = rows.rows[0] ?? null;
  const toggles = useLiveRows<{ envelope: string }>(
    TOGGLES_SQL,
    changesetId === null ? null : [changesetId],
    ['commands'],
  );
  const pollRows = useLiveRows<PollRow>(POLL_SQL, row?.poll_id ? [row.poll_id] : null, ['polls']);
  const ballots = useLiveRows<{ user_id: string; position: number }>(
    BALLOTS_SQL,
    row?.poll_id ? [row.poll_id] : null,
    ['ballots', 'poll_options'],
  );
  const baseDays = useLiveRows<PlanDayRow>(
    DAYS_SQL,
    row ? [row.base_version_id] : null,
    DAYS_TABLES,
  );
  const baseItemRows = useLiveRows<PlanItemRow>(
    ITEMS_SQL,
    row ? [row.base_version_id] : null,
    ITEMS_TABLES,
  );
  const ops = useMemo(
    () =>
      withToggles(
        parseOps(row?.ops ?? null),
        toggles.rows.map((r) => r.envelope),
      ),
    [row?.ops, toggles.rows],
  );
  const poiIds = useMemo(
    () =>
      JSON.stringify([
        ...new Set(
          ops.flatMap((op) =>
            [op.before?.poi_id, op.after?.poi_id].filter(
              (id): id is string => typeof id === 'string',
            ),
          ),
        ),
      ]),
    [ops],
  );
  const pois = useLiveRows<{ id: string; name: string }>(POIS_SQL, [poiIds], ['pois']);

  const baseItems = useMemo(() => toPlanItems(baseItemRows.rows), [baseItemRows.rows]);
  const days = useMemo(
    () => (baseDays.rows.length > 0 ? toPlanDays(baseDays.rows) : plan.days),
    [baseDays.rows, plan.days],
  );
  const poll = pollRows.rows[0] ?? null;
  const crew = plan.members.map((m) => m.user_id);
  const inTrip = plan.trip?.phase === 'in';

  return useMemo((): ChangesetView => {
    const poiNames = new Map(pois.rows.map((p) => [p.id, p.name]));
    const cards = buildChangeCards(ops, baseItems, poiNames, plan.trip?.tz ?? null);
    const eligible = idArray(poll?.eligible_voter_ids ?? null);
    return {
      status: !rows.loaded ? 'loading' : row === null ? 'missing' : 'ready',
      row,
      plan,
      state: row === null ? 'draft' : changesetState(row.status, poll),
      mine: row !== null && row.author_id === plan.uid,
      cards,
      days,
      baseItems,
      prediction: predictDecider({
        ops,
        baseItems,
        crew,
        authorId: row?.author_id ?? plan.uid ?? '',
        costDeltaMinor: Number(row?.cost_delta_minor ?? 0),
        inTrip,
        now: new Date(),
      }),
      tally: poll === null ? null : tallyOf(ballots.rows, poll, eligible),
      closesAt: poll?.closes_at ?? null,
      numbers: reviewNumbers({
        items: baseItems,
        ops,
        crew,
        currency: plan.trip?.local_currency ?? null,
      }),
    };
    // `crew` derives from plan.members, already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops, baseItems, pois.rows, plan, poll, ballots.rows, row, rows.loaded, days, inTrip]);
}

export interface ChangesetActions {
  readonly toggle: (target: string, accepted: boolean) => Promise<SendResult | null>;
  readonly send: () => Promise<SendResult | null>;
  readonly applyPersonal: () => Promise<SendResult | null>;
  readonly applyGroup: () => Promise<SendResult | null>;
  readonly decide: (decision: 'yes' | 'no') => Promise<SendResult | null>;
}

export function useChangesetActions(changesetId: string | null): ChangesetActions {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  return useMemo(() => {
    const send = <P>(spec: ClientCommandSpec<P>, payload: (id: string) => P) =>
      commands === null || changesetId === null
        ? Promise.resolve(null)
        : commands.send(spec, payload(changesetId));
    return {
      toggle: (target: string, accepted: boolean) =>
        send(SET_CHANGESET_ITEM, (id) => ({ changeset_id: id, change_id: target, accepted })),
      send: () => send(SEND_CHANGESET, (id) => ({ changeset_id: id })),
      applyPersonal: () =>
        send(APPLY_CHANGESET, (id) => ({ changeset_id: id, scope: 'personal' as const })),
      applyGroup: () =>
        send(APPLY_CHANGESET, (id) => ({ changeset_id: id, scope: 'group' as const })),
      decide: (decision: 'yes' | 'no') =>
        send(APPROVE_CHANGESET, (id) => ({ changeset_id: id, decision })),
    };
  }, [commands, changesetId]);
}
