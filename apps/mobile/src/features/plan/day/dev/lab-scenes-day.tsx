/**
 * Plan lab scenes for the day view (3e-2 list mode) and its states: the day as drawn, a queued
 * offline edit and a member's change waiting for the crew, a free day, loading, the item sheet
 * (organiser and member), a booked item's warning, an item someone else removed, and add
 * (a search over the lab's temples).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';

import { toast } from '@/motion/island-toast';

import { AddItemSheetView, type AddSource } from '../add-item-sheet';
import type { DayRowState } from '../day-list';
import { DayView, type DayViewProps } from '../day-view';
import { ItemDetailSheet } from '../item-detail-sheet';
import type { DayItem } from '../plan-model';
import {
  DINNER,
  LAB_DATE,
  LAB_HERE,
  LAB_ITEMS,
  LAB_MEMBERS,
  labMeta,
  LAB_PLACES,
  LAB_TZ,
  TERRACES,
  WALK,
} from './lab-fixtures';

const noop = () => undefined;

/** A lab sheet's dismiss (Android back, ✕, drag) leaves the scene, as a real close would. */
export const closeScene = () => router.back();

export function labDay(overrides: Partial<DayViewProps> = {}): ReactNode {
  return (
    <DayView
      dayNo={3}
      dayCount={8}
      date={LAB_DATE}
      theme="Slow Ubud"
      here={LAB_HERE}
      rain={{ start: 13 * 60, end: 15 * 60 }}
      planning={false}
      onTogglePlanning={noop}
      items={LAB_ITEMS}
      states={new Map()}
      meta={labMeta}
      loading={false}
      offline={false}
      editable
      onOpen={noop}
      onAdd={noop}
      // The day's back eyebrow returns to the lab's list, as it returns to the plan in the app.
      onBack={closeScene}
      {...overrides}
    />
  );
}

const actions = {
  onSave: noop,
  onMoveToDay: noop,
  onRemove: noop,
  onSkipForMe: noop,
  onOpenPlace: noop,
  onOpenMaps: noop,
  onClose: closeScene,
};

/** The day after the open item was removed by someone else: the sheet closes with a toast. */
function ItemGone() {
  useEffect(() => {
    toast.show({
      id: 'plan-item-gone',
      title: t({ id: 'plan.day.item.goneTitle', message: 'This one’s off the plan' }),
      subtitle: t({
        id: 'plan.day.item.goneLine',
        message: 'Someone removed it while you had it open.',
      }),
    });
  }, []);
  return labDay();
}

function sheet(item: DayItem, canApply = true): ReactNode {
  return (
    <>
      {labDay()}
      <ItemDetailSheet
        item={item}
        dayNos={[1, 2, 3, 4, 5, 6, 7, 8]}
        members={LAB_MEMBERS}
        canApply={canApply}
        actions={actions}
      />
    </>
  );
}

/** Add to the day over the lab's temples: a search matches by name, the first three are saved. */
function AddItem() {
  const [source, setSource] = useState<AddSource>('search');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const rows =
    source === 'saved'
      ? LAB_PLACES.slice(0, 3)
      : needle === ''
        ? []
        : LAB_PLACES.filter((place) => place.name.toLowerCase().includes(needle));
  return (
    <>
      {labDay()}
      <AddItemSheetView
        date={LAB_DATE}
        items={LAB_ITEMS}
        tz={LAB_TZ}
        members={LAB_MEMBERS.map((member) => member.uid)}
        canApply
        warningText={() => ''}
        onAdd={noop}
        onClose={closeScene}
        source={source}
        onSource={setSource}
        query={query}
        onQuery={setQuery}
        places={{ rows, loaded: true }}
      />
    </>
  );
}

const pending = new Map<string, DayRowState>([
  ['i-walk', { queued: true, proposed: false, warning: null }],
  ['i-spa', { queued: false, proposed: true, warning: null }],
  ['i-lunch', { queued: false, proposed: false, warning: 'Overlaps Jatiluwih terraces' }],
]);

export const DAY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  day: () => labDay(),
  'day-pending': () => labDay({ states: pending, offline: true }),
  'day-free': () => labDay({ items: [], theme: null, rain: null }),
  'day-loading': () => labDay({ loading: true }),
  'day-read-only': () => labDay({ editable: false }),
  'item-sheet': () => sheet(TERRACES),
  'item-sheet-member': () => sheet(WALK, false),
  'item-sheet-booked': () => sheet(DINNER),
  'item-gone': () => <ItemGone />,
  'add-item': () => <AddItem />,
};
