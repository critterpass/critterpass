/**
 * Lab scenes for day trips in Explore: a Cusco trip's "Day trips from Cusco" on Explore in a trip
 * (Machu Picchu on day 3, the Sacred Valley not on a day), the area's page for the organiser, a
 * member, an area with no places yet, offline, and once it is on a day, and the day picker with a
 * day chosen. Built through the same views as the app; nothing is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import type { AreaLink } from '@/data/areas/area-links';
import { travelLine } from '@/data/areas/travel-line';
import { useLocale } from '@/lib/i18n/use-locale';

import type { PickCard } from '../../components/picks-row';
import { RegionPackCardView } from '../../components/region-pack-card';
import { estimateText, guideFor } from '../../format';
import { guideTagline } from '../../guide-copy';
import { weekdayOfDate } from '../../search/weekday-names';
import * as tripCopy from '../../trip-explore/copy';
import { TripExploreView } from '../../trip-explore/trip-explore-view';
import type { AreaAction, PickerDay } from '../area-model';
import { AreaView } from '../area-view';
import * as copy from '../copy';
import { DayPickerSheet } from '../day-picker-sheet';
import type { DayTripCard } from '../day-trips-model';

const noop = () => undefined;
const GUIDE = 'tokek';

const MACHU: AreaLink = {
  id: 'lab-link-machu',
  kind: 'day_trip',
  fromId: 'lab-cusco',
  toId: 'lab-machu-picchu',
  toName: 'Machu Picchu',
  toSlug: 'machu-picchu',
  minutes: 210,
  mode: 'train',
  dayLength: 'full',
  essential: true,
  cost: { amountMinor: 14000, currency: 'USD' },
  note: 'Trains leave from Poroy or Ollantaytambo. Book the entry slot before the train.',
  sources: [],
};
const VALLEY: AreaLink = {
  ...MACHU,
  id: 'lab-link-valley',
  toId: 'lab-sacred-valley',
  toName: 'Sacred Valley',
  toSlug: 'sacred-valley',
  minutes: 90,
  mode: 'tour',
  essential: false,
  cost: null,
  note: null,
};

const PICKS: readonly PickCard[] = [
  { id: 'citadel', name: 'The citadel', category: 'sight', photo: null },
  { id: 'sun-gate', name: 'Sun Gate', category: 'nature', photo: null },
  { id: 'huayna', name: 'Huayna Picchu', category: 'nature', photo: null },
];

/** Five days from Wednesday 11 November 2026; day 2 holds a booking and three stops. */
const DAYS: readonly PickerDay[] = [1, 2, 3, 4, 5].map((dayNo) => ({
  dayNo,
  date: `2026-11-${String(10 + dayNo)}`,
  edge: dayNo === 1 ? 'first' : dayNo === 5 ? 'last' : null,
  booked: dayNo === 2,
  otherArea: null,
  moves: dayNo === 2 ? 3 : dayNo === 4 ? 1 : 0,
}));

function DayTripsScene() {
  const locale = useLocale();
  const guide = guideFor(GUIDE);
  const cards: DayTripCard[] = [
    { id: MACHU.toId, name: MACHU.toName, travel: travelLine(MACHU), length: 'full', dayNo: 3 },
    {
      id: VALLEY.toId,
      name: VALLEY.toName,
      travel: travelLine(VALLEY),
      length: 'full',
      dayNo: null,
    },
    {
      id: 'lab-rainbow',
      name: 'Vinicunca Rainbow Mountain',
      travel: travelLine({ minutes: 195, mode: 'bus' }),
      length: 'half',
      dayNo: null,
    },
  ];
  return (
    <TripExploreView
      key={locale}
      hero={{
        name: 'Cusco',
        guide,
        tagline: guideTagline(guide, 'Cusco'),
        backLabel: tripCopy.backLabel(),
        onBack: noop,
        photo: null,
      }}
      savedCount={4}
      onSaved={noop}
      searchPlaceholder={tripCopy.searchPlaceholder('Cusco', guide.name)}
      onSearch={noop}
      offline={false}
      gaps={{ kind: 'full' }}
      picks={[]}
      placesCount={null}
      onSavePick={noop}
      dayTrips={{ city: 'Cusco', cards, onOpen: noop }}
      kinds={[]}
    />
  );
}

function AreaScene({
  action,
  places = true,
  offline = false,
  picking = false,
}: {
  readonly action: AreaAction;
  readonly places?: boolean;
  readonly offline?: boolean;
  /** The day picker is open on day 2 (a booking stays, three stops go back to Ideas). */
  readonly picking?: boolean;
}) {
  const locale = useLocale();
  const guide = guideFor(GUIDE);
  const [chosen, setChosen] = useState<number | null>(2);
  const [open, setOpen] = useState(picking);
  return (
    <>
      <AreaView
        hero={{
          name: MACHU.toName,
          guide,
          tagline: copy.tagline('Cusco'),
          backLabel: copy.backLabel(),
          onBack: noop,
          photo: null,
        }}
        travel={travelLine(MACHU)}
        length={copy.lengthTag('full')}
        cost={copy.costLine(estimateText(locale, 14000, 'USD'))}
        note={MACHU.note}
        offline={offline}
        picks={places ? PICKS : []}
        placesComing={!places}
        pack={
          <RegionPackCardView
            destinationName={MACHU.toName}
            status="none"
            progress={0}
            bytes={null}
            onDownload={noop}
            onRemove={noop}
          />
        }
        action={action}
        onDayDate={action.kind === 'onDay' ? 'Fri 13 Nov' : null}
        onAdd={() => setOpen(true)}
        onChangeDay={() => setOpen(true)}
        onRemove={noop}
      />
      {open ? (
        <DayPickerSheet
          areaName={MACHU.toName}
          chips={DAYS.map((day) => ({
            dayNo: day.dayNo,
            weekday: weekdayOfDate(day.date) ?? '',
            dateLabel: day.date === null ? undefined : String(Number(day.date.slice(8, 10))),
            color: guide.colour,
            accessibilityLabel: copy.onDayTag(day.dayNo),
          }))}
          days={DAYS}
          selectedDayNo={chosen}
          onSelect={setChosen}
          sending={false}
          onConfirm={() => setOpen(false)}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export const DAY_TRIP_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'day-trips': () => <DayTripsScene />,
  'day-trip-area': () => <AreaScene action={{ kind: 'add' }} />,
  'day-trip-area-member': () => <AreaScene action={{ kind: 'member', organiser: 'Maya' }} />,
  'day-trip-area-no-places': () => <AreaScene action={{ kind: 'add' }} places={false} />,
  'day-trip-area-offline': () => <AreaScene action={{ kind: 'offline' }} offline />,
  'day-trip-area-on-day': () => <AreaScene action={{ kind: 'onDay', dayNo: 3, canChange: true }} />,
  'day-trip-picker': () => <AreaScene action={{ kind: 'add' }} picking />,
};
