/**
 * One plan item (design in code; logged in docs/undesigned-states.md): place, time in 15-minute
 * steps, who's going, cost, booking, notes and the item's comments, with move to another day,
 * remove, skip it just for me, and open in maps. Edits are held until SAVE (or SUGGEST for a
 * member, whose change goes to the crew); a booked or must-do item asks first.
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
import { AvatarStack } from '@/ui/people/AvatarStack';
import { ActionPill } from '@/ui/plan/ActionPill';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { money } from './format';
import type { DayItem } from './plan-model';
import { TimeRangeField } from './time-range-field';
import type { PlanMember } from './use-trip-plan';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['16'] },
  label: { marginBottom: th.space['4'] },
}));

export interface ItemDetailActions {
  readonly onSave: (start: number, end: number, confirmLocked: boolean) => void;
  readonly onMoveToDay: (dayNo: number, confirmLocked: boolean) => void;
  readonly onRemove: (confirmLocked: boolean) => void;
  readonly onSkipForMe: () => void;
  readonly onOpenPlace: (poiId: string) => void;
  readonly onOpenMaps: () => void;
  readonly onClose: () => void;
}

type Pending =
  | { readonly kind: 'save'; readonly start: number; readonly end: number }
  | { readonly kind: 'move'; readonly dayNo: number }
  | { readonly kind: 'remove' };

function Section({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View>
      <Text variant="eyebrow" color={theme.semantic.text.secondary} style={styles.label}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function ItemDetailSheet({
  item,
  dayNos,
  members,
  canApply,
  comments,
  actions,
}: {
  readonly item: DayItem;
  readonly dayNos: readonly number[];
  readonly members: readonly PlanMember[];
  readonly canApply: boolean;
  readonly comments?: ReactNode;
  readonly actions: ItemDetailActions;
}) {
  const styles = useStyles();
  const locale = useLocale();
  const { t } = useLingui();
  const [times, setTimes] = useState<{ start: number; end: number } | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);

  const start = times?.start ?? item.start;
  const end = times?.end ?? item.end;
  const changed = times !== null && (times.start !== item.start || times.end !== item.end);
  const locked = item.lock !== null;
  const run = (pending: Pending, confirmed: boolean) => {
    if (locked && !confirmed) {
      setConfirming(pending);
      return;
    }
    setConfirming(null);
    if (pending.kind === 'save') actions.onSave(pending.start, pending.end, confirmed);
    if (pending.kind === 'move') actions.onMoveToDay(pending.dayNo, confirmed);
    if (pending.kind === 'remove') actions.onRemove(confirmed);
  };
  const going = members.filter((member) => item.attendeeIds.includes(member.uid));
  const cost =
    item.amountMinor === null || item.currency === null
      ? null
      : item.amountMinor === 0
        ? // A stop with nothing to pay (a temple, a beach, a walk) says so, never "SGD 0 each".
          t({ id: 'plan.day.item.costFree', message: 'Free' })
        : item.costModel === 'per_person'
          ? t({
              id: 'plan.day.item.costEach',
              message: `${money(locale, item.amountMinor, item.currency)} each`,
            })
          : t({
              id: 'plan.day.item.costGroup',
              message: `${money(locale, item.amountMinor, item.currency)} for the group`,
            });
  const saveLabel = canApply
    ? t({ id: 'plan.day.item.save', message: 'Save' })
    : t({ id: 'plan.day.item.suggest', message: 'Suggest to the crew' });

  return (
    <Sheet
      title={upper(item.title, locale)}
      detents={['large']}
      onDismiss={actions.onClose}
      accessibilityLabel={item.title}
      testID="plan-item-sheet"
    >
      {confirming === null ? (
        <SheetScrollView contentContainerStyle={styles.body} testID="plan-item-scroll">
          {item.lock === 'booking' ? <StatusChip status="booked" /> : null}
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
          <Section label={t({ id: 'plan.day.item.who', message: 'Who’s going' })}>
            {going.length === 0 ? (
              <Text variant="body">{t({ id: 'plan.day.item.everyone', message: 'Everyone' })}</Text>
            ) : (
              <Row gap="8" align="center">
                <AvatarStack
                  members={going.map((member) => ({
                    key: member.uid,
                    name: member.name,
                    joinIndex: member.joinIndex,
                  }))}
                  size="sm"
                />
                <Text variant="bodySm">{going.map((member) => member.name).join(', ')}</Text>
              </Row>
            )}
          </Section>
          {cost === null ? null : (
            <Section label={t({ id: 'plan.day.item.cost', message: 'Cost' })}>
              <Text variant="body">{cost}</Text>
            </Section>
          )}
          {item.bookingId === null ? null : (
            <Section label={t({ id: 'plan.day.item.booking', message: 'Booking' })}>
              <Text variant="body">
                {t({
                  id: 'plan.day.item.bookingLine',
                  message: 'Tickets and voucher are in Bookings.',
                })}
              </Text>
            </Section>
          )}
          {item.notes === null || item.poiId === null ? null : (
            <Section label={t({ id: 'plan.day.item.notes', message: 'Notes' })}>
              <Text variant="body">{item.notes}</Text>
            </Section>
          )}
          <Section label={t({ id: 'plan.day.item.moveTo', message: 'Move to' })}>
            <Row gap="6" wrap>
              {dayNos.map((dayNo) => (
                <ActionPill
                  key={dayNo}
                  label={t({ id: 'plan.day.item.dayChip', message: `Day ${dayNo}` })}
                  selected={dayNo === item.dayNo}
                  disabled={dayNo === item.dayNo}
                  onPress={() => run({ kind: 'move', dayNo }, false)}
                  testID={`plan-item-move-${dayNo}`}
                />
              ))}
            </Row>
          </Section>
          {comments}
          {changed && start !== null && end !== null ? (
            <PillButton
              label={saveLabel}
              onPress={() => run({ kind: 'save', start, end }, false)}
              testID="plan-item-save"
            />
          ) : null}
          <Row gap="16" wrap>
            {item.place !== null ? (
              <TextLink
                label={t({ id: 'plan.day.item.maps', message: 'Open in maps' })}
                onPress={actions.onOpenMaps}
              />
            ) : null}
            <TextLink
              label={t({ id: 'plan.day.item.skip', message: 'Skip it, just me' })}
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
      ) : (
        <View style={styles.body}>
          <ConfirmSheet
            mode="button"
            title={
              confirming.kind === 'remove' && !locked
                ? t({ id: 'plan.day.item.removeTitle', message: `Remove ${item.title}?` })
                : item.lock === 'booking'
                  ? t({ id: 'plan.day.item.bookedTitle', message: 'This one is booked' })
                  : t({ id: 'plan.day.item.lockedTitle', message: 'This one is a must-do' })
            }
            consequences={[
              item.lock === 'booking'
                ? t({
                    id: 'plan.day.item.bookedLine',
                    message: 'The booking stays as it is. Check the supplier can change it.',
                  })
                : locked
                  ? t({
                      id: 'plan.day.item.lockedLine',
                      message: 'Someone asked for this one. They’ll see the change.',
                    })
                  : t({
                      id: 'plan.day.item.removeLine',
                      message: 'It comes off the day for everyone going.',
                    }),
              ...(canApply
                ? []
                : [
                    t({
                      id: 'plan.day.item.memberLine',
                      message: 'The crew okays it before it changes.',
                    }),
                  ]),
            ]}
            confirmLabel={
              confirming.kind === 'remove'
                ? t({ id: 'plan.day.item.removeConfirm', message: 'Remove' })
                : t({ id: 'plan.day.item.changeConfirm', message: 'Change it anyway' })
            }
            onConfirm={() => run(confirming, true)}
            onCancel={() => setConfirming(null)}
            testID="plan-item-confirm"
          />
        </View>
      )}
    </Sheet>
  );
}
