/**
 * Bookings lab scenes for the by-hand form: correcting a booking, a flight being added (one zone,
 * and one across zones where the landing is read on the arrival airport's clock), its problems
 * once SAVE was tried, and the day picker open over it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { toWalletBooking } from '../data/model';
import { DatePickerSheet } from '../detail/DatePickerSheet';
import { BookingFormView } from '../detail/BookingFormView';
import {
  draftOf,
  emptyDraft,
  flightZones,
  problemsOf,
  zoneName,
  type BookingDraft,
} from '../detail/form-model';
import { LAB_BOOKINGS, LAB_SEGMENTS, LAB_TZ, LAB_UID } from './lab-fixtures';

const noop = () => undefined;
const AT = Date.parse('2026-10-01T00:00:00Z');
const TRIP = { start: '2026-10-02', end: '2026-10-04' };

function form(draft: BookingDraft, mode: 'add' | 'edit', showProblems = false): ReactNode {
  const zones = flightZones(draft, LAB_TZ);
  return (
    <BookingFormView
      mode={mode}
      draft={draft}
      problems={problemsOf(draft, LAB_TZ)}
      showProblems={showProblems}
      saving={false}
      zones={{ dep: zoneName(zones.dep, AT), arr: zoneName(zones.arr, AT) }}
      trip={TRIP}
      onChange={noop}
      onSave={noop}
    />
  );
}

const FLIGHT: BookingDraft = {
  ...emptyDraft('flight'),
  date: '2026-10-02',
  time: '07:05',
  arrive: '08:30',
  flight: '9G 956',
  from: 'SGN',
  to: 'DAD',
};

/**
 * The form with its day picker open. Closing the sheet unmounts it (as the field does), so the
 * next Android back leaves the scene instead of reaching a sheet that stays up.
 */
function DayScene() {
  const [open, setOpen] = useState(true);
  return (
    <>
      {form(FLIGHT, 'add')}
      {open ? (
        <DatePickerSheet
          value={FLIGHT.date}
          trip={TRIP}
          title="Day"
          onPick={() => setOpen(false)}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export const FORM_SCENES: Readonly<Record<string, () => ReactNode>> = {
  edit: () => {
    const row = LAB_BOOKINGS.find((item) => item.id === 'b-trek');
    if (row === undefined) return null;
    return form(draftOf(toWalletBooking(row, LAB_SEGMENTS, LAB_UID), LAB_TZ), 'edit');
  },
  'add-by-hand': () =>
    form({ ...emptyDraft('flight'), date: '2026-10-12', flight: 'SQ 93' }, 'add', true),
  'add-by-hand-flight': () => form(FLIGHT, 'add'),
  'add-by-hand-zones': () =>
    form({ ...FLIGHT, flight: 'VN 300', to: 'NRT', time: '23:50', arrive: '07:30' }, 'add'),
  'add-by-hand-day': () => <DayScene />,
};
