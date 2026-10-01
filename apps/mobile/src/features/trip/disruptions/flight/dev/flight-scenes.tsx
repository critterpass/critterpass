/**
 * Lab scenes for the flight-delayed screen (3k-5): SQ938 into Denpasar 2h 10m late, with Made's
 * pickup confirmed, the villa told, Rin's landing unchanged and dinner waiting on the crew; then
 * the other states (someone else answered, waiting on others, still working, no answer from the
 * vendor, cancelled with the airline link, diverted, landed, undone, offline, loading, gone).
 * Every handler is a no-op; the names are the scene ids the device sheets pair with renders.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DisruptionAction } from '@cp/domain';
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { flightEyebrow, heroLines } from '../copy';
import { FlightView, type FlightViewProps } from '../flight-view';
import { delayParts, flightModel, type DisruptionRowData } from '../model';

const ME = '0190f0a0-0000-7000-8000-00000000000a';
const MAYA = '0190f0a0-0000-7000-8000-00000000000b';
const ALEX = '0190f0a0-0000-7000-8000-00000000000c';
const RIN = '0190f0a0-0000-7000-8000-00000000000d';
const PEOPLE = [
  { id: ME, name: 'Winston' },
  { id: MAYA, name: 'Maya' },
  { id: ALEX, name: 'Alex' },
  { id: RIN, name: 'Rin' },
];
const POLL = {
  id: '0190f0a0-0000-7000-8000-0000000000f1',
  approve_option_id: '0190f0a0-0000-7000-8000-0000000000f2',
  keep_option_id: '0190f0a0-0000-7000-8000-0000000000f3',
};
const noop = () => undefined;

function action(
  fields: Partial<DisruptionAction> & Pick<DisruptionAction, 'id' | 'kind' | 'state' | 'label'>,
): DisruptionAction {
  return {
    class: 'plan',
    autonomous: true,
    reversible: true,
    cost_delta_minor: 0,
    booking_impact: false,
    affected_user_ids: [ME, MAYA, ALEX],
    item_stable_id: null,
    provider_id: null,
    starts_at: null,
    depends_on: null,
    facts: {},
    decider: null,
    poll: null,
    guide_action_id: null,
    vendor_message_id: null,
    decided_by: null,
    ...fields,
  };
}

const MADE = action({
  id: 'contact_vendor:pickup',
  kind: 'contact_vendor',
  class: 'vendor',
  state: 'confirmed',
  autonomous: false,
  facts: { vendor: 'Made', from: '11:40', to: '13:50', role: 'pickup' },
  label: 'Made rebooked for a 13:50 pickup, same car',
});
const VILLA = action({
  id: 'retime_item:villa',
  kind: 'retime_item',
  state: 'done',
  facts: { title: 'Villa check-in', from: '13:00', to: '15:30' },
  label: "Villa knows you'll check in around 15:30",
});
const RIN_ROW = action({
  id: 'notify_unaffected:crew',
  kind: 'notify_unaffected',
  class: 'system',
  state: 'done',
  affected_user_ids: [RIN],
  label: 'Rin still lands at 22:40, nothing changes for her',
});
const DINNER = action({
  id: 'retime_item:dinner',
  kind: 'retime_item',
  state: 'needs_yes',
  autonomous: false,
  facts: { title: 'Dinner', from: '19:30', to: '21:00' },
  decider: {
    policy: 'majority_of_affected',
    threshold: 2,
    tie_breaker: 'organiser',
    closes_at: '2026-10-12T11:00:00Z',
  },
  poll: POLL,
  label: 'Dinner 19:30 → 21:00',
});

function row(actions: DisruptionAction[], fields: Partial<DisruptionRowData> = {}) {
  return {
    id: 'sq938-delay',
    trip_id: 'bali-trip',
    kind: 'flight_delay',
    cause: 'delay',
    status: 'open',
    version: 1,
    title: 'SQ938 lands at 13:50',
    summary: 'New arrival 13:50. Tokek has already sorted most of it.',
    affected: JSON.stringify({
      traveller_ids: [ME, MAYA, ALEX],
      item_stable_ids: [],
      unaffected_ids: [RIN],
    }),
    facts: JSON.stringify({ flight: 'SQ938', delay_min: 130, new_arrival: '13:50' }),
    actions: JSON.stringify(actions),
    i18n: null,
    ref_id: null,
    ...fields,
  };
}

function Scene(props: {
  readonly rows: DisruptionAction[];
  readonly fields?: Partial<DisruptionRowData>;
  readonly me?: string;
  readonly view?: Partial<FlightViewProps>;
}) {
  const locale = useLocale();
  const data = row(props.rows, props.fields);
  const model = flightModel(data, props.me ?? ME, PEOPLE, false);
  return (
    <FlightView
      state="ready"
      model={model}
      eyebrow={flightEyebrow(
        { flight: 'SQ 938', from: 'SIN', to: 'DPS', departs: new Date('2026-10-12T03:40:00Z') },
        locale,
      )}
      heroLines={heroLines(model.cause, delayParts(model.delayMin), locale)}
      detail={data.summary}
      guide="tokek"
      guideName="Tokek"
      tz="Asia/Makassar"
      offline={false}
      joinIndex={(uid) =>
        Math.max(
          0,
          PEOPLE.findIndex((p) => p.id === uid),
        )
      }
      onAnswer={noop}
      onTellCrew={noop}
      onUndoAll={noop}
      onOpenLink={noop}
      {...props.view}
    />
  );
}

const DESIGN = [MADE, VILLA, RIN_ROW, DINNER];

export const FLIGHT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3k-5': () => <Scene rows={DESIGN} />,
  '3k-5-decided-by-other': () => (
    <Scene rows={[MADE, VILLA, RIN_ROW, { ...DINNER, state: 'approved', decided_by: MAYA }]} />
  ),
  '3k-5-other-member': () => <Scene rows={DESIGN} me={RIN} />,
  '3k-5-in-progress': () => (
    <Scene
      rows={[
        { ...MADE, state: 'sent', label: 'Pickup message ready for Made' },
        { ...VILLA, state: 'running' },
        RIN_ROW,
        DINNER,
      ]}
    />
  ),
  '3k-5-no-answer': () => <Scene rows={[{ ...MADE, state: 'no_answer' }, VILLA, RIN_ROW]} />,
  '3k-5-cancelled': () => (
    <Scene
      fields={{
        cause: 'cancelled',
        summary:
          "SQ938 won't fly today. Rebook with Singapore Airlines and I'll fit the plan around it.",
      }}
      rows={[
        action({
          id: 'rebook_flight:seg',
          kind: 'rebook_flight',
          class: 'link',
          state: 'link',
          autonomous: false,
          facts: { carrier: 'SQ', flight: 'SQ938' },
          label: 'Rebook on SQ',
        }),
        {
          ...MADE,
          state: 'draft_ready',
          label: "Tell Made the flight won't land today?",
          decider: DINNER.decider,
          poll: POLL,
          facts: { vendor: 'Made', from: '11:40' },
        },
        RIN_ROW,
      ]}
    />
  ),
  '3k-5-diverted': () => (
    <Scene
      fields={{ cause: 'diverted', summary: 'SQ938 is landing in Surabaya instead. I am on it.' }}
      rows={[RIN_ROW]}
    />
  ),
  '3k-5-landed': () => <Scene fields={{ status: 'resolved' }} rows={[MADE, VILLA, RIN_ROW]} />,
  '3k-5-undone': () => (
    <Scene
      fields={{ status: 'undone' }}
      rows={[
        { ...VILLA, state: 'undone' },
        { ...DINNER, state: 'kept', decided_by: ME },
      ]}
    />
  ),
  '3k-5-offline': () => <Scene rows={DESIGN} view={{ offline: true }} />,
  '3k-5-loading': () => <Scene rows={[]} view={{ state: 'loading', model: null }} />,
  '3k-5-missing': () => <Scene rows={[]} view={{ state: 'missing', model: null }} />,
};

export const FLIGHT_SCENE_NAMES = Object.keys(FLIGHT_SCENES);
