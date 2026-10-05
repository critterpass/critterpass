/**
 * One plan item (design in code; logged in docs/undesigned-states.md): place, time (a tap picks
 * it, ±15 nudges it), who's going, cost, booking, notes and the item's comments, with move to
 * another day, remove, skip it just for me, and open in maps. A new time and a new day are both
 * held until SAVE (or SUGGEST for a member, whose change goes to the crew), which stays at the
 * sheet's foot with one line saying what else the change moves, or what it runs into; a booked or
 * must-do item asks first.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Row } from '@/ui/layout/Row';
import { ActionPill } from '@/ui/plan/ActionPill';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { ItemConfirm } from './item-confirm';
import { ItemFacts, Section } from './item-facts';
import { SheetFoot } from './sheet-foot';
import { TimeRangeField } from './time-range-field';
import { type DayItem } from '@/data/plan/plan-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

const useStyles = makeStyles((th) => ({
  fill: { flex: 1 },
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['16'] },
  label: { marginBottom: th.space['4'] },
}));

/** What a change would do to the rest of the day, before it is saved. */
export interface ChangePreview {
  /** "3 later stops move by 1 h", or what the change runs into. */
  readonly line: string | null;
  /** The change can't be saved as it is. */
  readonly blocked: boolean;
  /** The first start that would work, offered in one tap when the chosen one is taken. */
  readonly useStart?: number;
}

export interface ItemDetailActions {
  readonly onSave: (start: number, end: number, confirmLocked: boolean) => void;
  /** Another day; `times` when the time changed with it. */
  readonly onMoveToDay: (
    dayNo: number,
    confirmLocked: boolean,
    times?: { readonly start: number; readonly end: number },
  ) => void;
  readonly onRemove: (confirmLocked: boolean) => void;
  readonly onSkipForMe: () => void;
  readonly onOpenPlace: (poiId: string) => void;
  readonly onOpenMaps: () => void;
  readonly onClose: () => void;
}

/** More lines than any place name takes at the largest text size. */
const TITLE_LINES = 8;

type Pending = { readonly kind: 'save' } | { readonly kind: 'remove' };

export function ItemDetailSheet({
  item,
  dayNos,
  members,
  canApply,
  comments,
  actions,
  dayLabels,
  mustDoMine = false,
  removeLine = null,
  priceLevel = null,
  suggestion = null,
  preview,
}: {
  readonly item: DayItem;
  readonly dayNos: readonly number[];
  readonly members: readonly PlanMember[];
  readonly canApply: boolean;
  readonly comments?: ReactNode;
  readonly actions: ItemDetailActions;
  /** Each day named by its date ("Sat, Oct 17"); a day without one reads "Day 3". */
  readonly dayLabels?: ReadonlyMap<number, string>;
  /** The must-do is the reader's own. */
  readonly mustDoMine?: boolean;
  /** What taking the stop off does to the rest of its day ("3 later stops move 1 h earlier"). */
  readonly removeLine?: string | null;
  /** The place's price level (0 = known to be free); null = not known. */
  readonly priceLevel?: number | null;
  /** A change to this stop the crew is still deciding on. */
  readonly suggestion?: { readonly line: string; readonly onSee: () => void } | null;
  readonly preview?: (change: {
    readonly start: number;
    readonly end: number;
    readonly dayNo: number;
  }) => ChangePreview;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const [times, setTimes] = useState<{ start: number; end: number } | null>(null);
  const [toDay, setToDay] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);

  const start = times?.start ?? item.start;
  const end = times?.end ?? item.end;
  const retimed = times !== null && (times.start !== item.start || times.end !== item.end);
  const dayNo = toDay ?? item.dayNo;
  const moved = dayNo !== item.dayNo;
  const changed = retimed || moved;
  const effect: ChangePreview =
    !changed || start === null || end === null || preview === undefined
      ? { line: null, blocked: false }
      : preview({ start, end, dayNo });
  const locked = item.lock !== null;
  const dayChip = (dayNo: number) => t({ id: 'plan.day.item.dayChip', message: `Day ${dayNo}` });
  const run = (pending: Pending, confirmed: boolean) => {
    if (locked && !confirmed) {
      setConfirming(pending);
      return;
    }
    setConfirming(null);
    if (pending.kind === 'remove') actions.onRemove(confirmed);
    else if (moved) {
      actions.onMoveToDay(
        dayNo,
        confirmed,
        retimed && start !== null && end !== null ? { start, end } : undefined,
      );
    } else if (start !== null && end !== null) actions.onSave(start, end, confirmed);
  };
  const saveLabel = canApply
    ? t({ id: 'plan.day.item.save', message: 'Save' })
    : t({ id: 'plan.day.item.suggest', message: 'Suggest to the crew' });

  return (
    <Sheet
      header={
        // A long place name wraps until it is whole: the sheet scrolls, so nothing is cut.
        <Text
          variant="h1"
          numberOfLines={TITLE_LINES}
          singleLine={false}
          accessibilityRole="header"
        >
          {upper(item.title, locale)}
        </Text>
      }
      detents={['large']}
      onDismiss={actions.onClose}
      accessibilityLabel={item.title}
      testID="plan-item-sheet"
    >
      {confirming === null ? (
        <View style={styles.fill}>
          <SheetScrollView
            style={styles.fill}
            contentContainerStyle={styles.body}
            testID="plan-item-scroll"
          >
            {item.lock === 'booking' ? <StatusChip status="booked" /> : null}
            {suggestion === null ? null : (
              <ListCard
                title={suggestion.line}
                subtitle={t({
                  id: 'plan.day.item.suggestionLine',
                  message: 'Waiting for the crew to say yes.',
                })}
                chevron
                onPress={suggestion.onSee}
                testID="plan-item-suggestion"
              />
            )}
            {item.poiId !== null ? (
              <ListCard
                title={item.title}
                subtitle={t({
                  id: 'plan.day.item.placeDetail',
                  message: 'Hours, photos and how to get there',
                })}
                chevron
                onPress={() => item.poiId !== null && actions.onOpenPlace(item.poiId)}
                testID="plan-item-place"
              />
            ) : null}
            {start !== null && end !== null ? (
              <Section label={t({ id: 'plan.day.item.when', message: 'When' })}>
                <TimeRangeField
                  start={start}
                  end={end}
                  onChange={(s, e) => setTimes({ start: s, end: e })}
                />
              </Section>
            ) : null}
            <ItemFacts item={item} members={members} priceLevel={priceLevel} />
            <Section label={t({ id: 'plan.day.item.moveTo', message: 'Move to' })}>
              <Row gap="6" wrap>
                {dayNos.map((option) => (
                  <ActionPill
                    key={option}
                    label={dayLabels?.get(option) ?? dayChip(option)}
                    selected={option === dayNo}
                    onPress={() => setToDay(option === item.dayNo ? null : option)}
                    testID={`plan-item-move-${option}`}
                  />
                ))}
              </Row>
            </Section>
            {comments}
            <Row gap="16" wrap>
              {item.place !== null ? (
                <TextLink
                  label={t({ id: 'plan.day.item.maps', message: 'Open in maps' })}
                  onPress={actions.onOpenMaps}
                />
              ) : null}
              <TextLink
                label={
                  members.length <= 1
                    ? t({ id: 'plan.day.item.skipSolo', message: 'Skip this stop' })
                    : t({ id: 'plan.day.item.skip', message: 'Skip it, just me' })
                }
                onPress={actions.onSkipForMe}
                testID="plan-item-skip"
              />
            </Row>
            <PillButton
              variant="destructive"
              label={t({ id: 'plan.day.item.remove', message: 'Remove from the day' })}
              onPress={() => setConfirming({ kind: 'remove' })}
              testID="plan-item-remove"
            />
          </SheetScrollView>
          <SheetFoot
            effect={effect}
            saveLabel={saveLabel}
            canSave={changed && !effect.blocked}
            onUseStart={(from) =>
              start === null || end === null
                ? undefined
                : setTimes({ start: from, end: from + (end - start) })
            }
            onSave={() => run({ kind: 'save' }, false)}
          />
        </View>
      ) : (
        <View style={styles.body}>
          <ItemConfirm
            item={item}
            removing={confirming.kind === 'remove'}
            canApply={canApply}
            mustDoMine={mustDoMine}
            alsoMoves={confirming.kind === 'remove' ? removeLine : null}
            solo={members.length <= 1}
            onConfirm={() => run(confirming, true)}
            onCancel={() => setConfirming(null)}
          />
        </View>
      )}
    </Sheet>
  );
}
