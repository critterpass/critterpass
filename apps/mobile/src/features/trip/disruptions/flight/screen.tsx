/**
 * The flight-delayed screen (3k-5) over synced rows: the `disruptions` row (its rows tick as the
 * worker really completes them, through sync), the flight leg it is about, the trip's guide and
 * crew. Every answer, undo and TELL THE CREW is a queued command, so it works the same with no
 * signal; the toast says what happened.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { DisruptionAction } from '@cp/domain';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useGuideText } from '@/lib/i18n/guide-text';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';

import { useLiveRows, useOwnerUid } from '../../hub/data/live-rows';
import { guideName, guideOr } from '../../hub/guide';
import {
  announceDisruptionCommand,
  decideDisruptionActionCommand,
  undoDisruptionActionCommand,
} from '../commands';
import { flightEyebrow, heroLines, toastLines } from './copy';
import { FlightView } from './flight-view';
import { delayParts, flightModel, type DisruptionRowData } from './model';

const DISRUPTION_SQL = `SELECT id, trip_id, kind, cause, status, version, title, summary, affected,
    facts, actions, i18n, ref_id
  FROM disruptions WHERE id = ?`;
const SEGMENT_SQL = `SELECT booking_id, carrier, flight_no, dep_airport, arr_airport, sched_dep_at
  FROM flight_segments WHERE id = ?`;
const TRIP_SQL = `SELECT t.crew_id, coalesce(t.tz, d.tz, 'UTC') AS tz, g.slug AS guide_slug,
    g.name AS guide_name
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = ?`;
const CREW_SQL = `SELECT m.user_id, m.role, coalesce(u.display_name, '') AS name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? AND m.status = 'active' ORDER BY m.created_at, m.user_id`;

interface SegmentRow {
  readonly booking_id: string;
  readonly carrier: string;
  readonly flight_no: string;
  readonly dep_airport: string;
  readonly arr_airport: string;
  readonly sched_dep_at: string;
}

interface TripRow {
  readonly crew_id: string;
  readonly tz: string;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
}

interface CrewRow {
  readonly user_id: string;
  readonly role: string;
  readonly name: string;
}

export function FlightDisruptionScreen({ id }: { readonly id: string }) {
  const me = useOwnerUid();
  const locale = useLocale();
  const words = useGuideText();
  const sync = useSyncStatus();
  const disruption = useLiveRows<DisruptionRowData>(DISRUPTION_SQL, [id], ['disruptions']);
  const row = disruption.rows[0] ?? null;
  const segment = useLiveRows<SegmentRow>(SEGMENT_SQL, row?.ref_id == null ? null : [row.ref_id], [
    'flight_segments',
  ]).rows[0];
  const trip = useLiveRows<TripRow>(TRIP_SQL, row === null ? null : [row.trip_id], [
    'trips',
    'destinations',
    'guides',
  ]).rows[0];
  const crew = useLiveRows<CrewRow>(CREW_SQL, trip === undefined ? null : [trip.crew_id], [
    'crew_members',
    'users',
  ]).rows;
  const decide = useCommand(decideDisruptionActionCommand);
  const undo = useCommand(undoDisruptionActionCommand);
  const announce = useCommand(announceDisruptionCommand);
  const [telling, setTelling] = useState(false);

  const guide = guideOr(trip?.guide_slug);
  const guideLabel = guideName(guide, trip?.guide_name);
  const model = useMemo(() => {
    if (row === null) return null;
    const people = crew.map((member) => ({ id: member.user_id, name: member.name }));
    const organiser = crew.some((member) => member.user_id === me && member.role === 'organiser');
    return flightModel(row, me, people, organiser);
  }, [row, crew, me]);

  const state = !disruption.loaded
    ? 'loading'
    : row === null || model === null
      ? 'missing'
      : 'ready';
  const flight = model === null ? '' : String(model.facts['flight'] ?? '');
  const eyebrow = flightEyebrow(
    {
      flight: segment === undefined ? flight : `${segment.carrier} ${segment.flight_no}`,
      from: segment?.dep_airport ?? null,
      to: segment?.arr_airport ?? model?.facts['airport']?.toString() ?? null,
      departs: segment === undefined ? null : new Date(segment.sched_dep_at),
    },
    locale,
  );
  const joinIndex = (uid: string) =>
    Math.max(
      0,
      crew.findIndex((m) => m.user_id === uid),
    );
  const toasts = toastLines(guideLabel);

  return (
    <FlightView
      state={state}
      model={model}
      eyebrow={eyebrow}
      heroLines={
        model === null ? ['', null] : heroLines(model.cause, delayParts(model.delayMin), locale)
      }
      detail={row === null ? '' : (words('disruption', row, 'summary') ?? row.summary)}
      guide={guide}
      guideName={guideLabel}
      tz={trip?.tz ?? 'UTC'}
      offline={sync.phase === 'offline'}
      joinIndex={joinIndex}
      telling={telling}
      onAnswer={(actionId, decision) =>
        void decide.send({ disruption_id: id, action_id: actionId, decision })
      }
      onTellCrew={() => {
        setTelling(true);
        void announce
          .send({ disruption_id: id })
          .then(() => toast.show({ id: `disruption-told-${id}`, title: toasts.told }))
          .finally(() => setTelling(false));
      }}
      onUndoAll={() =>
        void undo
          .send({ disruption_id: id, action_id: 'all' })
          .then(() => toast.show({ id: `disruption-undone-${id}`, title: toasts.undone }))
      }
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onOpenLink={(link: DisruptionAction) => {
        if (link.kind === 'rebook_flight' && segment !== undefined) {
          router.push({
            pathname: '/(tabs)/wallet/bookings/[id]',
            params: { id: segment.booking_id },
          });
        }
      }}
    />
  );
}
