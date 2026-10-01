/**
 * The running-late screen (3k-9) over synced rows: the `disruptions` row (the ETA and the options
 * move through sync as the server refreshes them), the place on the current plan and the late
 * party's names. The map shows the place and the phone's own dot from the location engine's last
 * fix; nothing here asks for a permission. Picking an option is a queued command; picking a car
 * then opens Getting around, which quotes the ride from where the phone is.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and status names, never copy. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useGuideText } from '@/lib/i18n/guide-text';
import { getLocationEngine } from '@/lib/location/use-location-status';
import { toast } from '@/motion';
import { CpMap } from '@/ui/map/CpMap';

import { useLiveRows, useOwnerUid } from '../../hub/data/live-rows';
import { chooseLateOptionCommand } from '../commands';
import { lateLines } from './copy';
import { LateView } from './late-view';
import { lateModel, type LateRowData } from './model';

const LATE_SQL = `SELECT id, trip_id, kind, status, title, summary, affected, facts, options,
    actions, chosen_option_id, i18n
  FROM disruptions WHERE id = ? AND kind = 'running_late'`;
const PLACE_SQL = `SELECT p.id, p.name, p.lat, p.lng FROM disruptions d
  JOIN trips t ON t.id = d.trip_id
  JOIN plan_items i ON i.version_id = t.current_version_id
    AND i.stable_id = json_extract(d.affected, '$.item_stable_ids[0]')
  JOIN pois p ON p.id = i.poi_id
  WHERE d.id = ?`;
const NAMES_SQL = `SELECT u.id, coalesce(u.display_name, '') AS name FROM users u
  WHERE u.id IN (SELECT value FROM json_each(?))`;

interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

export function RunningLateScreen({ id }: { readonly id: string }) {
  const me = useOwnerUid();
  const words = useGuideText();
  const sync = useSyncStatus();
  const late = useLiveRows<LateRowData>(LATE_SQL, [id], ['disruptions']);
  const row = late.rows[0] ?? null;
  const place = useLiveRows<PlaceRow>(
    PLACE_SQL,
    [id],
    ['disruptions', 'trips', 'plan_items', 'pois'],
  ).rows[0];
  const model = useMemo(() => (row === null ? null : lateModel(row, me)), [row, me]);
  const party = useLiveRows<{ id: string; name: string }>(
    NAMES_SQL,
    model === null ? null : [JSON.stringify(model.partyIds)],
    ['users'],
  ).rows;
  const choose = useCommand(chooseLateOptionCommand);
  const [sending, setSending] = useState(false);
  const fix = getLocationEngine()?.recentFixes().at(-1) ?? null;
  const offline = sync.phase === 'offline';
  const map =
    place === undefined || offline ? null : (
      <CpMap
        places={[
          {
            id: place.id,
            name: place.name,
            iconKey: 'pin',
            categoryLabel: '',
            lat: place.lat,
            lng: place.lng,
          },
        ]}
        initialCenter={[place.lng, place.lat]}
        {...(fix === null
          ? {}
          : { youLocation: [fix.lng, fix.lat], locationStatus: 'granted-in-destination' as const })}
      />
    );

  return (
    <LateView
      state={!late.loaded ? 'loading' : model === null ? 'missing' : 'ready'}
      model={model}
      reason={row === null ? '' : (words('disruption', row, 'summary') ?? row.summary)}
      lateNames={party.map((p) => p.name).filter((name) => name !== '')}
      map={map}
      sending={sending}
      onBack={() => router.back()}
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
