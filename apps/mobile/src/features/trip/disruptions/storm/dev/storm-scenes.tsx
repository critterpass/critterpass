/**
 * Lab scenes for the storm screen (3k-8): rough seas on Friday's boat with Saturday calm, four of
 * six voted to swap, then the other states (already voted, a member not on the item, decided,
 * the booker's Confirm & pay, waiting on the booker, seats not confirmed, moved, no calm day to
 * swap with, the forecast improved, offline, loading, gone). Every handler is a no-op; the names
 * are the scene ids the device sheets pair with renders.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import {
  stormModel,
  type BallotRowData,
  type PollRowData,
  type StormOptionData,
  type StormRowData,
} from '../model';
import { StormView, type StormViewProps } from '../storm-view';

const WINSTON = '0190f0a0-0000-7000-8000-00000000000a';
const MAYA = '0190f0a0-0000-7000-8000-00000000000b';
const ALEX = '0190f0a0-0000-7000-8000-00000000000c';
const JORDAN = '0190f0a0-0000-7000-8000-00000000000d';
const DEV = '0190f0a0-0000-7000-8000-00000000000e';
const RIN = '0190f0a0-0000-7000-8000-00000000000f';
const PEOPLE = [
  { id: WINSTON, name: 'Winston' },
  { id: MAYA, name: 'Maya' },
  { id: ALEX, name: 'Alex' },
  { id: JORDAN, name: 'Jordan' },
  { id: DEV, name: 'Dev' },
  { id: RIN, name: 'Rin' },
];
const noop = () => undefined;

const option = (
  fields: Partial<StormOptionData> & Pick<StormOptionData, 'id' | 'label'>,
): StormOptionData => ({
  recommended: false,
  per_person_minor: 0,
  currency: 'USD',
  supplier: 'none',
  facts: { title: 'the boat', from: 'Friday', to: 'Saturday', day: 'Friday' },
  note: null,
  poll_option_id: `option-${fields.id}`,
  swap_day: '2026-10-17',
  ...fields,
});

const SWAP = option({ id: 'swap', label: 'Swap Friday and Saturday', recommended: true });
const KEEP = option({ id: 'keep', label: 'Keep Friday' });
const SKIP = option({
  id: 'skip',
  label: 'Skip the boat',
  per_person_minor: -3800,
  supplier: 'viator_cancel',
});
const REBOOK = { ...SWAP, supplier: 'viator_rebook' };

const FOUR_SWAP: BallotRowData[] = [MAYA, ALEX, JORDAN, WINSTON].map((uid) => ({
  user_id: uid,
  option_id: 'option-swap',
}));

function row(options: StormOptionData[], fields: Partial<StormRowData> = {}): StormRowData {
  return {
    id: 'penida-storm',
    trip_id: 'bali-trip',
    status: 'open',
    cause: 'rough_seas',
    title: 'Rough seas Friday',
    summary: 'Saturday is flat calm. Swap the days and nobody spends Friday seasick.',
    facts: JSON.stringify({ title: 'Nusa Penida boat', waves_m: 2.5, wind_kmh: 35 }),
    options: JSON.stringify(options),
    source_snapshot: JSON.stringify({ day: '2026-10-16' }),
    chosen_option_id: null,
    i18n: null,
    ...fields,
  };
}

const POLL: PollRowData = {
  id: 'storm-vote',
  status: 'open',
  eligible_voter_ids: JSON.stringify(PEOPLE.map((p) => p.id)),
  closes_at: '2026-10-15T10:00:00Z',
  winner_option_id: null,
};

function scene(input: {
  options?: StormOptionData[];
  fields?: Partial<StormRowData>;
  poll?: Partial<PollRowData>;
  ballots?: BallotRowData[];
  me?: string;
  view?: Partial<StormViewProps>;
}) {
  const data = row(input.options ?? [SWAP, KEEP, SKIP], input.fields);
  return (
    <StormView
      state="ready"
      model={stormModel(
        data,
        { ...POLL, ...input.poll },
        input.ballots ?? FOUR_SWAP,
        input.me ?? DEV,
      )}
      title={data.title}
      line={data.summary}
      tz="Asia/Makassar"
      guide="tokek"
      guideName="Tokek"
      offline={false}
      people={PEOPLE}
      booker={null}
      sending={false}
      onBack={noop}
      onVote={noop}
      onConfirmPay={noop}
      {...input.view}
    />
  );
}

const decided = (move: StormOptionData['supplier_move'], status = 'open') => ({
  options: [{ ...REBOOK, ...(move === undefined ? {} : { supplier_move: move }) }, KEEP, SKIP],
  fields: { status, chosen_option_id: 'swap' },
  poll: { status: 'closed', winner_option_id: 'option-swap' },
});
const PAY = { state: 'awaiting_booker_payment', new_date: '2026-10-17' };

export const STORM_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-8': () => scene({}),
  '3k-8-voted': () => scene({ me: MAYA }),
  '3k-8-no-votes': () => scene({ ballots: [] }),
  '3k-8-not-voting': () =>
    scene({ poll: { eligible_voter_ids: JSON.stringify([MAYA, ALEX, JORDAN, WINSTON]) }, me: RIN }),
  '3k-8-decided': () =>
    scene({ fields: { status: 'resolved', chosen_option_id: 'swap' }, poll: { status: 'closed' } }),
  '3k-8-booker-pay': () =>
    scene({ ...decided(PAY), me: MAYA, view: { booker: { id: MAYA, name: 'Maya', me: true } } }),
  '3k-8-waiting-on-booker': () =>
    scene({ ...decided(PAY), view: { booker: { id: MAYA, name: 'Maya', me: false } } }),
  '3k-8-seats-not-confirmed': () =>
    scene({
      ...decided({ state: 'seats_not_confirmed', new_date: '2026-10-17' }, 'resolved'),
      view: { booker: { id: MAYA, name: 'Maya', me: false } },
    }),
  '3k-8-moved': () =>
    scene({
      ...decided({ state: 'moved', new_date: '2026-10-17' }, 'resolved'),
      view: { booker: { id: MAYA, name: 'Maya', me: false } },
    }),
  '3k-8-no-swap-day': () => scene({ options: [{ ...KEEP, recommended: true }, SKIP], ballots: [] }),
  '3k-8-deadline-passed': () =>
    scene({
      fields: { status: 'resolved', chosen_option_id: 'keep' },
      poll: { status: 'closed' },
      ballots: [],
    }),
  '3k-8-forecast-improved': () =>
    scene({ fields: { status: 'withdrawn' }, poll: { status: 'cancelled' } }),
  '3k-8-offline': () => scene({ view: { offline: true } }),
  '3k-8-loading': () => scene({ view: { state: 'loading', model: null } }),
  '3k-8-missing': () => scene({ view: { state: 'missing', model: null } }),
};

export const STORM_SCENE_NAMES = Object.keys(STORM_SCENES);
