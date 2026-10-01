/**
 * Lab scenes for the legendary calendar (3l-9): the year's legendaries with Sakura Pon on your
 * trip's dates and the crew's Golden Tokek at 4 of 6, every reminder on, notifications off, and a
 * catalogue with no legendaries yet. REMIND ME toggles.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import type { WindowRow } from '../data/queries';
import { buildLegendaries, stripMonths, type WindowArtRow } from '../legendary/legendary-model';
import { LegendaryView } from '../legendary/legendary-view';

const range = (start: string, end: string) => JSON.stringify({ type: 'annual_range', start, end });

const WINDOWS: WindowRow[] = [
  ['ajo', 'cp-041', 'Mexico City · Día de Muertos', range('11-01', '11-02')],
  [
    'pon',
    'cp-061',
    'Kyoto · the week the blossoms peak',
    JSON.stringify({ type: 'month_part', month: 4, part: 'early' }),
  ],
  ['sardi', 'cp-076', 'Lisbon · Santo António night', range('06-12', '06-12')],
  ['paco', 'cp-145', 'Cusco · Inti Raymi', range('06-24', '06-24')],
  [
    'lundi',
    'cp-148',
    'Heimaey · puffling nights',
    JSON.stringify({ type: 'month_part', month: 8, part: 'late' }),
  ],
  ['tokek', 'cp-112', 'Bali · all six on Batur by sunrise', JSON.stringify({ type: 'any_day' })],
].map(([id, key, place, rule]) => ({
  id: `window-${id}`,
  key: id ?? null,
  form_id: `${key}-legendary`,
  place_line: place ?? null,
  rule: rule ?? null,
  months: null,
  solar: null,
  challenge: null,
}));

const ART: WindowArtRow[] = WINDOWS.map((w) => {
  const key = w.form_id.replace('-legendary', '');
  return {
    form_id: w.form_id,
    key,
    no: Number(key.slice(3)),
    canonical_seed: 7,
    critter_id: key,
    set_id: `set-${key}`,
  };
});

/** A Kyoto trip over blossom week: only Kyoto's legendary is on its dates. */
const TRIP = { start_date: '2027-04-02', end_date: '2027-04-09', critter_set_id: 'set-cp-061' };
const NOW = new Date('2026-10-02T03:00:00Z');

function Calendar({
  windows = WINDOWS,
  remindAll = false,
  notificationsOff = false,
}: {
  readonly windows?: readonly WindowRow[];
  readonly remindAll?: boolean;
  readonly notificationsOff?: boolean;
}) {
  const [on, setOn] = useState(remindAll);
  const items = buildLegendaries({
    windows,
    art: ART,
    entries: [],
    reminders: new Set(on ? windows.map((w) => w.id) : []),
    trip: TRIP,
    now: NOW,
    tz: 'Asia/Ho_Chi_Minh',
    copresence: new Map([['window-tokek', { here: 4, needed: 6, missing: ['Alex', 'Dev'] }]]),
  });
  return (
    <LegendaryView
      items={items}
      months={stripMonths(items, TRIP, NOW.getMonth() + 1)}
      allReminded={on}
      notificationsOff={notificationsOff}
      onRemind={() => setOn((v) => !v)}
    />
  );
}

export const LEGENDARY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-9-once-a-year': () => <Calendar />,
  '3l-9-reminders-on': () => <Calendar remindAll />,
  '3l-9-notifications-off': () => <Calendar remindAll notificationsOff />,
  '3l-9-empty': () => <Calendar windows={[]} />,
};
