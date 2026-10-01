/**
 * Lab scenes for the running-late screen (3k-9): Wes and Jordan 25 minutes late for Karsa Spa
 * with Maya and Rin waiting there, then the other states (Karsa said yes, the walk beats the ride,
 * a party with no ride, already picked, the ETA gone stale, the waiting crew's view, on time
 * again, no map offline, loading, gone). Every handler is a no-op; the names are the scene ids
 * the device sheets pair with renders. The map is whatever the caller draws.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { DisruptionAction, LateOption } from '@cp/domain';
import type { ReactNode } from 'react';

import { LateView, type LateViewProps } from '../late-view';
import { lateModel, type LateRowData } from '../model';

const WES = '0190f0a0-0000-7000-8000-00000000000a';
const JORDAN = '0190f0a0-0000-7000-8000-00000000000b';
const MAYA = '0190f0a0-0000-7000-8000-00000000000c';
const RIN = '0190f0a0-0000-7000-8000-00000000000d';
const SPA = '0190f0a0-0000-7000-8000-0000000000c1';
const noop = () => undefined;

export const LATE_SCENE_PLACE = { id: SPA, name: 'Karsa Spa', lat: -8.5005, lng: 115.254 };

const option = (fields: Partial<LateOption> & Pick<LateOption, 'id' | 'label' | 'detail'>) => ({
  offered: true,
  recommended: false,
  split: true,
  new_start: null,
  arrive_at: null,
  per_person_minor: 0,
  currency: null,
  supplier: 'none' as const,
  vendor_name: null,
  facts: { title: 'Karsa Spa' },
  ...fields,
});

const PUSH = option({
  id: 'push',
  label: 'Push the slot',
  detail: 'Maya and Rin start on time. You and Jordan slot in after.',
  recommended: true,
  vendor_name: 'Karsa',
  facts: { title: 'Karsa Spa', from: '14:00', to: '14:30', minutes: 30 },
});
const WALK = option({
  id: 'walk',
  label: 'Walk the last bit',
  detail: '12 min on foot from here. There about 13:58.',
  facts: { title: 'Karsa Spa', walk_min: 12, saves_min: 27, arrive: '13:58' },
});
const SKIP = option({ id: 'skip', label: 'Skip it', detail: 'The others go ahead without you.' });
const CAR = option({ id: 'car', label: 'Call a car', detail: 'Fare and pickup time from Grab.' });

const message = (state: DisruptionAction['state']) => ({
  id: `contact_vendor:${SPA}`,
  kind: 'contact_vendor',
  class: 'vendor',
  state,
  autonomous: false,
  reversible: false,
  cost_delta_minor: 0,
  booking_impact: false,
  affected_user_ids: [WES, JORDAN],
  item_stable_id: SPA,
  provider_id: null,
  starts_at: null,
  depends_on: null,
  facts: { vendor: 'Karsa' },
  decider: null,
  poll: null,
  guide_action_id: null,
  vendor_message_id: null,
  decided_by: null,
  label: 'Tell Karsa: Wes and Jordan at 14:30?',
});

function row(fields: Partial<LateRowData> = {}, options: LateOption[] = [PUSH, SKIP]) {
  return {
    id: 'spa-late',
    trip_id: 'bali-trip',
    kind: 'running_late',
    status: 'open',
    title: 'Karsa Spa · +25 min',
    summary: 'Traffic is heavy on Jalan Raya. Made is looping round through Penestanan.',
    affected: JSON.stringify({
      traveller_ids: [WES, JORDAN],
      item_stable_ids: [SPA],
      unaffected_ids: [MAYA, RIN],
    }),
    facts: JSON.stringify({ title: 'Karsa Spa', start: '14:00', eta: '14:25', late_min: 25 }),
    options: JSON.stringify(options),
    actions: '[]',
    chosen_option_id: null,
    i18n: null,
    ...fields,
  };
}

export function lateScenes(map: () => ReactNode): Readonly<Record<string, () => ReactNode>> {
  const scene = (
    fields: Partial<LateRowData> = {},
    options?: LateOption[],
    view: Partial<LateViewProps> = {},
    me = WES,
  ) => {
    const data = row(fields, options);
    return (
      <LateView
        state="ready"
        model={lateModel(data, me)}
        reason={data.summary}
        lateNames={['Wes', 'Jordan']}
        map={map()}
        sending={false}
        onBack={noop}
        onChoose={noop}
        {...view}
      />
    );
  };
  const stale = JSON.stringify({
    title: 'Karsa Spa',
    start: '14:00',
    eta: '14:25',
    late_min: 25,
    stale: 'yes',
  });
  return {
    '3k-9': () => scene(),
    '3k-9-vendor-said-yes': () => scene({ actions: JSON.stringify([message('confirmed')]) }),
    '3k-9-walk': () => scene({}, [PUSH, { ...WALK, recommended: true }, SKIP]),
    '3k-9-no-ride': () => scene({}, [{ ...PUSH, vendor_name: null }, SKIP, CAR]),
    '3k-9-chosen': () => scene({ chosen_option_id: 'push' }),
    '3k-9-stale': () => scene({ facts: stale }),
    '3k-9-waiting-crew': () => scene({}, undefined, {}, MAYA),
    '3k-9-on-time': () => scene({ status: 'resolved' }),
    '3k-9-no-map': () => scene({}, undefined, { map: null }),
    '3k-9-loading': () => scene({}, undefined, { state: 'loading', model: null }),
    '3k-9-missing': () => scene({}, undefined, { state: 'missing', model: null }),
  };
}

export const LATE_SCENE_NAMES = Object.keys(lateScenes(() => null));
