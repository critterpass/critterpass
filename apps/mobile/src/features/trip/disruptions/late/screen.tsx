/**
 * The running-late screen (3k-9) over synced rows: the `disruptions` row (the ETA and the options
 * move through sync as the server refreshes them), the place on the current plan and the late
 * party's names. The map shows the place and the phone's own dot from the location engine's last
 * fix; nothing here asks for a permission. Picking an option is a queued command; picking a car
 * then opens Getting around, which quotes the ride from where the phone is.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and status names, never copy. */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { lateStep } from '@/features/plan';
import { useGuideText } from '@/lib/i18n/guide-text';
import { getLocationEngine } from '@/lib/location/use-location-status';
import { toast } from '@/motion';

import { useLiveRows, useOwnerUid } from '../../hub/data/live-rows';
import { guideName, guideOr } from '../../hub/guide';
import { chooseLateOptionCommand } from '../commands';
import { lateLines } from './copy';
import { LateMap } from './late-map';
import { LateView } from './late-view';
import { lateModel, type LateRowData } from './model';
import { SaidLateScreen } from './said-late-screen';

const LATE_SQL = `SELECT id, trip_id, kind, status, title, summary, affected, facts, options,
    actions, chosen_option_id, i18n
  FROM disruptions WHERE id = ? AND kind = 'running_late'`;
const PLACE_SQL = `SELECT p.id, p.name, p.lat, p.lng FROM disruptions d
  JOIN trips t ON t.id = d.trip_id
  JOIN plan_items i ON i.version_id = t.current_version_id
    AND i.stable_id = json_extract(d.affected, '$.item_stable_ids[0]')
  JOIN pois p ON p.id = i.poi_id
  WHERE d.id = ?`;
const GUIDE_SQL = `SELECT g.slug AS guide_slug, g.name AS guide_name, dest.slug AS destination_slug
  FROM disruptions d JOIN trips t ON t.id = d.trip_id LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN destinations dest ON dest.id = t.destination_id WHERE d.id = ?`;
const NAMES_SQL = `SELECT u.id, coalesce(u.display_name, '') AS name FROM users u
  WHERE u.id IN (SELECT value FROM json_each(?))`;

interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * The route's screen: a lateness the server knows about (by its id: the journey check or a
 * lock-screen report opened it), or one the traveller is saying right now for a stop of today.
 */
export function RunningLateScreen({ id }: { readonly id: string }) {
  const said = useLocalSearchParams<{ tripId?: string; stop?: string; minutes?: string }>();
  if (said.tripId && said.stop) {
    return (
      <SaidLateScreen
        tripId={said.tripId}
        stableId={said.stop}
        minutes={lateStep(said.minutes)}
        known={(open) => <KnownLateScreen id={open} />}
      />
    );
  }
  return <KnownLateScreen id={id} />;
}

export function KnownLateScreen({ id }: { readonly id: string }) {
  const me = useOwnerUid();
  const words = useGuideText();
  const syncPhase = useSyncPhase();
  const late = useLiveRows<LateRowData>(LATE_SQL, [id], ['disruptions']);
  const row = late.rows[0] ?? null;
  const place = useLiveRows<PlaceRow>(
    PLACE_SQL,
    [id],
    ['disruptions', 'trips', 'plan_items', 'pois'],
  ).rows[0];
  const trip = useLiveRows<{
    guide_slug: string | null;
    guide_name: string | null;
    destination_slug: string | null;
  }>(GUIDE_SQL, [id], ['disruptions', 'trips', 'guides', 'destinations']).rows[0];
  const guide = guideOr(trip?.guide_slug);
  const model = useMemo(() => (row === null ? null : lateModel(row, me)), [row, me]);
  const party = useLiveRows<{ id: string; name: string }>(
    NAMES_SQL,
    model === null ? null : [JSON.stringify(model.partyIds)],
    ['users'],
  ).rows;
  const choose = useCommand(chooseLateOptionCommand);
  const [sending, setSending] = useState(false);
  const fix = getLocationEngine()?.recentFixes().at(-1) ?? null;
  const offline = syncPhase === 'offline';
  const map =
    place === undefined || offline ? null : (
      <LateMap place={place} you={fix} destinationSlug={trip?.destination_slug ?? null} />
    );

  return (
    <LateView
      state={!late.loaded ? 'loading' : model === null ? 'missing' : 'ready'}
      model={model}
      reason={row === null ? '' : (words('disruption', row, 'summary') ?? row.summary)}
      lateNames={party.map((p) => p.name).filter((name) => name !== '')}
      map={map}
      guide={guide}
      guideName={guideName(guide, trip?.guide_name)}
      sending={sending}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onChoose={(option) => {
        setSending(true);
        void choose
          .send({ disruption_id: id, option_id: option })
          .then(() => {
            toast.show({ id: `late-chosen-${id}-${option}`, title: lateLines().told });
            if (option === 'car' && row !== null && place !== undefined) {
              router.push({
                pathname: '/(trip)/getting-around',
                params: { tripId: row.trip_id, to: place.id },
              });
            }
          })
          .finally(() => setSending(false));
      }}
    />
  );
}
