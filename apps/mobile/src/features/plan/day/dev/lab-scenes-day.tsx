/**
 * Plan lab scenes for a stop's sheet over the day plan (7b-1, the Bali Six's third day): as the
 * organiser, as a member, and a booked stop's warning.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { DayPlanScene } from '../../trip-map/dev/plan-screens-scenes';
import { ItemDetailSheet } from '../item-detail-sheet';
import { DINNER, LAB_MEMBERS, TERRACES, WALK } from './lab-fixtures';
import { type DayItem } from '@/data/plan/plan-model';

const noop = () => undefined;

/** A lab sheet's dismiss (Android back, ✕, drag) leaves the scene, as a real close would. */
export const closeScene = () => router.back();

/** The day plan a stop's sheet opens over. */
export function labDay(): ReactNode {
  return <DayPlanScene />;
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

export const DAY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'item-sheet': () => sheet(TERRACES),
  'item-sheet-member': () => sheet(WALK, false),
  'item-sheet-booked': () => sheet(DINNER),
};
