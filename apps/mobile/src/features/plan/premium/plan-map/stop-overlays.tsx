/**
 * What opens over the plan map for one stop: its menu (4.29) and, from the menu, its details
 * sheet. Moving it to another day and changing its time happen on that sheet, where both are timed
 * against the rest of the day before they are saved. Asking the guide opens the guide with a
 * question about the stop waiting in the composer; sharing shares the stop. Removing asks first,
 * then takes the stop off with what it moved (as the sheet does). A booked stop never offers
 * removal; a member's changes go through the editor, which turns them into suggestions.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Share } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import { removeOp, type DaySlot } from '@/data/plan/plan-ops';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { confirmAlert } from '@/ui/premium/shell';

import { ItemSheetHost, type ItemSheetEditor } from '../../day/item-sheet-host';
import { confirmWords } from '../../day/item-words';
import { useMustDoMine, useTakeOff } from '../../day/use-take-off';
import { PremiumClashCard, PremiumDayActions } from '../stop/day-actions';
import { PremiumItemComments } from '../stop/item-comments';
import { PremiumItemSheet } from '../stop/item-sheet';
import { planMapCopy } from './copy';
import type { LiftRect } from './menu-choice';
import { StopMenu } from './stop-menu';
import { stopOffers } from './stop-offers';
import type { usePlanMap } from './use-plan-map';

const STOP_LOOK = {
  Sheet: PremiumItemSheet,
  DayActions: PremiumDayActions,
  Clash: PremiumClashCard,
  Comments: PremiumItemComments,
};

/** The stop open over the map: its menu, lifted from where its card sat, or its details. */
export interface OpenStop {
  readonly id: string;
  readonly from: LiftRect | null;
  readonly details: boolean;
}

export function StopOverlays(props: {
  readonly tripId: string;
  readonly map: ReturnType<typeof usePlanMap>;
  readonly stop: OpenStop;
  readonly onDetails: () => void;
  readonly onClose: () => void;
}) {
  const { map } = props;
  const { data, day } = map;
  const stop = day?.items.find((item) => item.stableId === props.stop.id) ?? null;
  if (stop === null || day === null) return null;
  const slot = { dayNo: day.dayNo, date: day.date ?? '' };
  if (props.stop.details) {
    return (
      <ItemSheetHost
        key={stop.stableId}
        plan={data.plan}
        item={stop}
        slot={slot}
        editor={map.editor}
        onClose={props.onClose}
        look={STOP_LOOK}
      />
    );
  }
  return (
    <OpenStopMenu
      tripId={props.tripId}
      map={map}
      plan={data.plan}
      item={stop}
      slot={slot}
      editor={map.editor}
      from={props.stop.from}
      onDetails={props.onDetails}
      onClose={props.onClose}
    />
  );
}

function OpenStopMenu(props: {
  readonly tripId: string;
  readonly map: ReturnType<typeof usePlanMap>;
  readonly plan: TripPlan;
  readonly item: DayItem;
  readonly slot: DaySlot;
  readonly editor: ItemSheetEditor;
  readonly from: LiftRect | null;
  readonly onDetails: () => void;
  readonly onClose: () => void;
}) {
  const { map, plan, item, tripId } = props;
  const { t } = useLingui();
  const takeOff = useTakeOff(plan, item, props.slot, undefined);
  const mustDoMine = useMustDoMine(plan, item);
  const row = map.rows.find((entry) => entry.id === item.stableId);
  const guide = map.model.guide.name;
  const ask = hrefFor('3j-1', { tripId, q: planMapCopy.stop.askAbout(item.title) });
  const offers = stopOffers({
    readOnly: map.model.readOnly,
    booked: item.bookingId !== null,
    canAsk: ask !== undefined,
  });
  const remove = () => {
    const words = confirmWords({
      item,
      removing: true,
      canApply: plan.canApply,
      mustDoMine,
      solo: plan.members.length <= 1,
      alsoMoves: takeOff.line(),
    });
    void confirmAlert({
      title: words.title,
      message: words.lines.join(' '),
      confirm: words.confirm,
      cancel: t({ id: 'plan.premium.item.cancel', message: 'Cancel' }),
      destructive: true,
    }).then((yes) => {
      if (yes) void props.editor.submit([removeOp(item), ...takeOff.ops], { confirmLocked: true });
    });
  };
  const line = row?.time ?? null;
  return (
    <StopMenu
      stop={{
        id: item.stableId,
        dayNo: props.slot.dayNo,
        title: item.title,
        line,
        booked: item.bookingId !== null,
        leg: row?.legAfter ?? null,
      }}
      from={props.from}
      guideName={guide}
      onClose={props.onClose}
      onDetails={props.onDetails}
      onTime={offers.time ? props.onDetails : undefined}
      onMove={offers.move ? props.onDetails : undefined}
      onAsk={offers.ask && ask !== undefined ? () => router.push(ask) : undefined}
      onShare={() => void Share.share({ message: [item.title, line].filter(Boolean).join(' · ') })}
      onRemove={offers.remove ? remove : undefined}
    />
  );
}
