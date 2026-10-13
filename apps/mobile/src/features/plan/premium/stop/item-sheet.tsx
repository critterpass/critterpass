/**
 * A stop's details in the premium look (4.29's "details" row; the design draws no sheet for it, so
 * it is built from the sheet kit): the stop's title and time, what leads it on the day, a booked
 * tag, a change the crew is deciding on, the place, its start and end (± 15 minutes), who is going,
 * the cost, its booking and notes, the day to move it to, comments, maps and "skip it, just me",
 * and Remove. Save (Suggest for a member) waits at the foot with one line on what else the change
 * moves; a booked, pinned or must-do stop, and any removal, asks first. The shared `ItemSheetHost`
 * times every change and sends it through the plan editor.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CrewStack,
  ListCard,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert } from '@/ui/premium/shell';

import { clock, clockRange } from '../../day/format';
import { confirmWords, useFactWords } from '../../day/item-words';
import type { ChangePreview, ItemDetailSheetProps } from '../../day/item-sheet-look';
import { OverlaySheet } from '../sheets/overlay-sheet';
import { LinkRow, Section } from './sheet-parts';
import { TimeRows } from './time-rows';

export function PremiumItemSheet(props: ItemDetailSheetProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { item, actions, members, canApply } = props;
  const readOnly = props.readOnly ?? false;
  const facts = useFactWords({ item, members, priceLevel: props.priceLevel ?? null });
  const [times, setTimes] = useState<{ start: number; end: number } | null>(null);
  const [toDay, setToDay] = useState<number | null>(null);
  const start = times?.start ?? item.start;
  const end = times?.end ?? item.end;
  const retimed = times !== null && (times.start !== item.start || times.end !== item.end);
  const targetDay = toDay ?? item.dayNo;
  const moved = targetDay !== item.dayNo;
  const changed = retimed || moved;
  const effect: ChangePreview =
    !changed || start === null || end === null || props.preview === undefined
      ? { line: null, blocked: false }
      : props.preview({ start, end, dayNo: targetDay });
  const locked = item.lock !== null;

  const apply = (removing: boolean, confirmed: boolean) => {
    if (removing) actions.onRemove(confirmed);
    else if (moved)
      actions.onMoveToDay(
        targetDay,
        confirmed,
        retimed && start !== null && end !== null ? { start, end } : undefined,
      );
    else if (start !== null && end !== null) actions.onSave(start, end, confirmed);
  };
  const run = (removing: boolean) => {
    if (!removing && !locked) {
      apply(false, false);
      return;
    }
    const words = confirmWords({
      item,
      removing,
      canApply,
      mustDoMine: props.mustDoMine ?? false,
      solo: facts.solo,
      alsoMoves: removing ? (props.removeLine ?? null) : null,
    });
    void confirmAlert({
      title: words.title,
      message: words.lines.join(' '),
      confirm: words.confirm,
      cancel: t({ id: 'plan.premium.item.cancel', message: 'Cancel' }),
      destructive: removing,
    }).then((yes) => {
      if (yes) apply(removing, true);
    });
  };
  const useStart = effect.useStart;

  return (
    <OverlaySheet
      tall
      title={item.title}
      {...(item.start === null || item.end === null
        ? {}
        : { line: clockRange(locale, item.start, item.end) })}
      closeLabel={t({ id: 'plan.premium.item.close', message: 'Close' })}
      onDismiss={actions.onClose}
      dirty={changed && !readOnly}
      discard={{
        title: t({ id: 'plan.premium.item.discard', message: 'Discard this change?' }),
        message: t({
          id: 'plan.premium.item.discardLine',
          message: 'The new time or day for this stop goes.',
        }),
        discard: t({ id: 'plan.premium.item.discardYes', message: 'Discard' }),
        keep: t({ id: 'plan.premium.item.keep', message: 'Keep editing' }),
      }}
      footer={
        readOnly ? undefined : (
          <>
            {effect.line === null ? null : (
              <Text
                variant="caption"
                {...(effect.blocked
                  ? { color: theme.color.status.voteOpen.text }
                  : { tone: 'muted' as const })}
                testID="plan-item-preview"
              >
                {effect.line}
              </Text>
            )}
            {useStart === undefined || start === null || end === null ? null : (
              <TextButton
                label={t({
                  id: 'plan.day.item.useStart',
                  message: `Start at ${clock(locale, useStart)} instead`,
                })}
                onPress={() => setTimes({ start: useStart, end: useStart + (end - start) })}
                testID="plan-item-use-start"
              />
            )}
            <Button
              label={
                canApply
                  ? t({ id: 'plan.day.item.save', message: 'Save' })
                  : t({ id: 'plan.day.item.suggest', message: 'Suggest to the crew' })
              }
              disabled={!changed || effect.blocked}
              onPress={() => run(false)}
              testID="plan-item-save"
            />
          </>
        )
      }
      testID="plan-item-sheet"
    >
      {props.lead ?? null}
      {item.lock === 'booking' ? (
        <StatusTag tone="booked" label={t({ id: 'plan.premium.item.booked', message: 'Booked' })} />
      ) : null}
      {props.suggestion == null ? null : (
        <LinkRow
          title={props.suggestion.line}
          line={t({
            id: 'plan.day.item.suggestionLine',
            message: 'Waiting for the crew to say yes.',
          })}
          onPress={props.suggestion.onSee}
          testID="plan-item-suggestion"
        />
      )}
      {item.poiId === null ? null : (
        <LinkRow
          title={item.title}
          line={t({
            id: 'plan.day.item.placeDetail',
            message: 'Hours, photos and how to get there',
          })}
          onPress={() => item.poiId !== null && actions.onOpenPlace(item.poiId)}
          testID="plan-item-place"
        />
      )}
      {start === null || end === null ? null : (
        <Section label={t({ id: 'plan.day.item.when', message: 'When' })}>
          <ListCard>
            {readOnly ? (
              <Text
                variant="rowTitle"
                style={{ padding: theme.space.rowPadH }}
                testID="plan-item-time"
              >
                {clockRange(locale, start, end)}
              </Text>
            ) : (
              <TimeRows
                start={start}
                end={end}
                onChange={(s, e) => setTimes({ start: s, end: e })}
              />
            )}
          </ListCard>
        </Section>
      )}
      <Section label={t({ id: 'plan.day.item.who', message: 'Who’s going' })}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.gap8,
            paddingHorizontal: theme.space.gap8,
          }}
        >
          {facts.going.length === 0 ? (
            <Text variant="body">
              {facts.solo
                ? t({ id: 'plan.day.item.justYou', message: 'Just you' })
                : t({ id: 'plan.day.item.everyone', message: 'Everyone' })}
            </Text>
          ) : (
            <>
              <CrewStack
                members={facts.going.map((member) => ({
                  id: member.uid,
                  name: member.name,
                  color: crewColour(member.joinIndex),
                }))}
                size={26}
                accessibilityLabel={facts.going.map((member) => member.name).join(', ')}
              />
              <Text variant="caption" style={{ flex: 1 }}>
                {facts.going.map((member) => member.name).join(', ')}
              </Text>
            </>
          )}
        </View>
      </Section>
      {facts.cost === null ? null : (
        <Section label={t({ id: 'plan.day.item.cost', message: 'Cost' })}>
          <Text variant="body" style={{ paddingHorizontal: theme.space.gap8 }}>
            {facts.cost}
          </Text>
        </Section>
      )}
      {item.bookingId === null ? null : (
        <Section label={t({ id: 'plan.day.item.booking', message: 'Booking' })}>
          <Text variant="body" style={{ paddingHorizontal: theme.space.gap8 }}>
            {t({
              id: 'plan.day.item.bookingLine',
              message: 'Tickets and voucher are in Bookings.',
            })}
          </Text>
        </Section>
      )}
      {item.notes === null || item.notes === item.title ? null : (
        <Section label={t({ id: 'plan.day.item.notes', message: 'Notes' })}>
          <Text variant="body" style={{ paddingHorizontal: theme.space.gap8 }}>
            {item.notes}
          </Text>
        </Section>
      )}
      {readOnly ? null : (
        <Section label={t({ id: 'plan.day.item.moveTo', message: 'Move to' })}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
            {props.dayNos.map((dayNo) => (
              <Button
                key={dayNo}
                size="small"
                variant={dayNo === targetDay ? 'primary' : 'control'}
                label={
                  props.dayLabels?.get(dayNo) ??
                  t({ id: 'plan.day.item.dayChip', message: `Day ${dayNo}` })
                }
                onPress={() => setToDay(dayNo === item.dayNo ? null : dayNo)}
                testID={`plan-item-move-${dayNo}`}
              />
            ))}
          </View>
        </Section>
      )}
      {props.comments ?? null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap16 }}>
        {item.place === null ? null : (
          <TextButton
            label={t({ id: 'plan.day.item.maps', message: 'Open in maps' })}
            onPress={actions.onOpenMaps}
          />
        )}
        {readOnly || actions.onSkipForMe === null ? null : (
          <TextButton
            label={
              facts.solo
                ? t({ id: 'plan.day.item.skipSolo', message: 'Skip this stop' })
                : t({ id: 'plan.day.item.skip', message: 'Skip it, just me' })
            }
            onPress={actions.onSkipForMe}
            testID="plan-item-skip"
          />
        )}
      </View>
      {readOnly ? null : (
        <Button
          variant="destructive"
          label={t({ id: 'plan.day.item.remove', message: 'Remove from the day' })}
          onPress={() => run(true)}
          testID="plan-item-remove"
        />
      )}
    </OverlaySheet>
  );
}
