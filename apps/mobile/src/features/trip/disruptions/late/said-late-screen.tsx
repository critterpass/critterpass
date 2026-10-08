/**
 * Running late (3k-9) as the traveller says it herself, from a stop of today. When the stop is
 * hers alone and she can change the plan, the screen shows what pushing it does to the rest of the
 * day before anything moves, and the push goes through the plan editor (which says what changed,
 * with undo). When others go to the stop too, the rest of the trip is told at once
 * (`report_running_late`) and the screen becomes the crew's own running-late options as soon as
 * they arrive. Skipping it just for her is always there.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useEffect, useState, type ReactNode } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { useSaidLate } from '@/features/plan';
import { goBackOr } from '@/lib/navigation/back';
import { getLocationEngine } from '@/lib/location/use-location-status';
import { toast } from '@/motion';

import { useLiveRows } from '../../hub/data/live-rows';
import { guideName, guideOr } from '../../hub/guide';
import { tripDayRoute } from '../../hub/routes';
import { reportRunningLateCommand } from '../../leave-by/commands';
import { saidLateLines, saidPushDetail } from './copy';
import { LateMap } from './late-map';
import { LateView } from './late-view';
import { saidLateModel } from './said-late-model';

const OPEN_SQL = `SELECT id FROM disruptions
  WHERE trip_id = ? AND kind = 'running_late' AND status = 'open'
    AND json_extract(affected, '$.item_stable_ids[0]') = ?
  ORDER BY created_at DESC LIMIT 1`;

/** The plan editor could not reach the plan: nothing moved. */
function isUnavailable(outcome: unknown): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    (outcome as { kind?: unknown }).kind === 'unavailable'
  );
}

/** One report per stop and minutes while the app runs: opening the screen again tells nobody twice. */
const reported = new Set<string>();

export function SaidLateScreen(props: {
  readonly tripId: string;
  readonly stableId: string;
  readonly minutes: number;
  /** The screen of a lateness the server has opened, by its id. */
  readonly known: (disruptionId: string) => ReactNode;
}) {
  const { tripId, stableId, minutes } = props;
  const syncPhase = useSyncPhase();
  const said = useSaidLate(tripId, stableId, minutes);
  const report = useCommand(reportRunningLateCommand);
  const [sending, setSending] = useState(false);
  const open = useLiveRows<{ id: string }>(OPEN_SQL, [tripId, stableId], ['disruptions']).rows[0];
  const { stop } = said;

  // Others go to this stop too: they are told now, and the server works out what she can do.
  const itemId = stop !== null && !stop.alone ? stop.itemId : null;
  const send = report.send;
  useEffect(() => {
    const key = `${stableId}:${minutes}`;
    if (itemId === null || reported.has(key)) return;
    reported.add(key);
    void send({ trip_id: tripId, item_id: itemId, minutes });
  }, [itemId, stableId, minutes, tripId, send]);

  if (open !== undefined && stop?.alone === false) return props.known(open.id);

  const back = () => goBackOr(tripDayRoute(tripId, null));
  const lines = saidLateLines();
  const guide = guideOr(said.guideSlug);
  const base = { guide, guideName: guideName(guide, null), sending, onBack: back };
  if (stop === null) {
    return (
      <LateView
        {...base}
        state={said.loaded ? 'missing' : 'loading'}
        model={null}
        reason=""
        lateNames={[]}
        map={null}
        onChoose={() => undefined}
      />
    );
  }
  const fix = getLocationEngine()?.recentFixes().at(-1) ?? null;
  const map =
    stop.place === null || syncPhase === 'offline' ? null : (
      <LateMap
        place={{ id: stableId, name: stop.title, lat: stop.place.lat, lng: stop.place.lng }}
        you={fix}
        destinationSlug={said.destinationSlug}
      />
    );
  return (
    <LateView
      {...base}
      state="ready"
      model={saidLateModel({
        title: stop.title,
        minutes,
        start: stop.start,
        to: stop.to,
        me: said.me,
        canPush: stop.canPush,
      })}
      // A push that runs into a stop that can't move says so; with a crew, who was told.
      reason={!stop.alone ? lines.told : (stop.blocked ?? lines.pick)}
      lateNames={[]}
      map={map}
      details={{ push: saidPushDetail(stop.title, stop.to, stop.moves), skip: lines.skip }}
      onChoose={(choice) => {
        if (sending) return;
        setSending(true);
        // The push answers with the plan editor's outcome (which also says what moved, with undo).
        const went =
          choice === 'push'
            ? said.push().then((outcome) => outcome !== false && !isUnavailable(outcome))
            : said.skip();
        void went
          .then((ok) => {
            if (!ok) {
              toast.show({ id: 'late-said-failed', title: lines.failed });
              return;
            }
            if (choice !== 'push') toast.show({ id: 'late-skipped', title: lines.skipped });
            back();
          })
          .finally(() => setSending(false));
      }}
    />
  );
}
