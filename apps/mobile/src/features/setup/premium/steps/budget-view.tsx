/**
 * The organiser's budget step in the premium look (4.15 the sweet spot, 4.16 waiting on maxes):
 * the checklist pill, "What feels comfy?", the amount each with its rail (the fill to the pick,
 * anonymous dots for the maxes, − and + by the crew's step), how many maxes are in, the split of
 * the amount (flights, stays, food, fun), a typed amount, the organiser's own max, and "Looks
 * good" (refused above someone's max). When one budget is below the cheapest plan the ways out
 * show. Every read and command is the shared `BudgetStep`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, Card, IconButton, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import {
  budgetLine,
  EMPTY_PICK,
  lockLine,
  type BudgetPick,
  type BudgetViewProps,
} from '../../budget/budget-props';
import {
  barsFor,
  currencySymbol,
  money,
  snap,
  typedAmountMinor,
  widenTrack,
  isOverBand,
} from '../../budget/model';
import { BudgetBreakdown } from './budget-breakdown';
import { ChecklistPill, StepHeadline, StepPage } from './step-parts';

export function PremiumBudgetView(props: BudgetViewProps) {
  const { band, currency, lock, trip } = props;
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const [ownPick, setOwnPick] = useState<BudgetPick>(EMPTY_PICK);
  const { picked, typed } = props.pick ?? ownPick;
  const setPick = props.onPick ?? setOwnPick;
  const track = props.track === null ? null : widenTrack(props.track, band, picked);
  const target = track === null ? 0 : snap(picked ?? props.initialTarget, track);
  const over = isOverBand(band, target);
  const infeasible = band.kind === 'infeasible';
  const guide = guideSticker(trip.guide).name;
  const message = lockLine(lock);
  const bars = track === null || props.estimatesLoading ? null : barsFor(target, props.estimates);
  const share = (value: number) =>
    track === null || track.maxMinor <= track.minMinor
      ? 0
      : (value - track.minMinor) / (track.maxMinor - track.minMinor);
  const dots = band.kind === 'waiting' ? null : band.dots;
  const pill = (
    <ChecklistPill
      row="budget"
      done={false}
      trailing={t({ id: 'setup.premium.budget.in', message: `${band.set} of ${band.of} in` })}
    />
  );
  const split =
    bars === null
      ? []
      : [
          {
            key: 'flights',
            label: t({ id: 'setup.premium.budget.flights', message: 'Flights' }),
            value: bars.flights,
            colour: theme.accent.sky,
          },
          {
            key: 'stays',
            label: t({ id: 'setup.premium.budget.stays', message: 'Stays' }),
            value: bars.stays,
            colour: theme.accent.tangerine,
          },
          {
            key: 'food',
            label: t({ id: 'setup.premium.budget.food', message: 'Food' }),
            value: bars.food,
            colour: theme.accent.pink,
          },
          {
            key: 'fun',
            label: t({ id: 'setup.premium.budget.fun', message: 'Fun' }),
            value: bars.fun,
            colour: theme.accent.mint,
          },
        ].filter((part) => part.value > 0);
  return (
    <StepPage
      title={t({ id: 'setup.premium.title', message: `${trip.destinationName} setup` })}
      {...(props.dates === null ? {} : { subtitle: props.dates })}
      testID="budget-step"
      footer={
        <>
          {message === null ? null : (
            <Text
              variant="caption"
              color={theme.color.destructive.helper}
              testID="budget-lock-line"
            >
              {message}
            </Text>
          )}
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={t({ id: 'setup.budget.cta', message: 'Looks good' })}
              onPress={() => props.onLock(target)}
              disabled={over || infeasible || track === null}
              loading={lock.kind === 'locking'}
              testID="budget-lock"
            />
          </View>
          {props.onSkip === null ? null : (
            <TextButton
              align="center"
              label={t({ id: 'setup.budget.skip', message: 'Skip the budget' })}
              onPress={props.onSkip}
              testID="budget-skip"
            />
          )}
        </>
      }
    >
      {pill}
      <StepHeadline
        title={t({ id: 'setup.budget.title', message: 'What feels comfy?' })}
        line={budgetLine(band, guide)}
      />
      {track === null ? null : (
        <Card padded testID="budget-sweet-spot">
          <Text variant="label" tone="muted">
            {t({ id: 'setup.premium.budget.each', message: 'Sweet spot, each' })}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
            <IconButton
              icon="minus"
              tone="control"
              label={t({ id: 'setup.premium.budget.less', message: 'Less' })}
              onPress={() =>
                setPick({ picked: Math.max(track.minMinor, target - track.stepMinor), typed: '' })
              }
              testID="budget-less"
            />
            <Text
              variant="hero"
              align="center"
              style={{ flex: 1 }}
              adjustsFontSizeToFit
              numberOfLines={1}
              testID="budget-amount"
            >
              {money(locale, target, currency)}
            </Text>
            <IconButton
              icon="plus"
              tone="control"
              label={t({ id: 'setup.premium.budget.more', message: 'More' })}
              onPress={() =>
                setPick({ picked: Math.min(track.maxMinor, target + track.stepMinor), typed: '' })
              }
              testID="budget-more"
            />
          </View>
          <View style={{ height: 30, justifyContent: 'center', marginTop: theme.space.gap8 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.color.control }} />
            <View
              style={{
                position: 'absolute',
                left: 0,
                width: `${String(Math.round(share(target) * 100))}%`,
                height: 6,
                borderRadius: 3,
                backgroundColor: over ? theme.color.destructive.fieldRing : theme.color.ink,
              }}
            />
            {(dots ?? []).map((dot, index) => (
              <View
                key={index}
                style={{
                  position: 'absolute',
                  left: `${String(Math.round(share(dot) * 100))}%`,
                  marginLeft: -7,
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 2.5,
                  borderColor: theme.color.outlineEmpty,
                  backgroundColor: theme.color.card,
                }}
              />
            ))}
          </View>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'setup.premium.budget.scale',
              message: `${money(locale, track.minMinor, currency)} · each dot is someone's max · ${money(locale, track.maxMinor, currency)}`,
            })}
          </Text>
        </Card>
      )}
      {infeasible && track !== null ? (
        <Card padded testID="budget-infeasible">
          <Text variant="headline">
            {t({
              id: 'setup.budget.infeasible.title',
              message: 'One budget is below the cheapest plan',
            })}
          </Text>
          <Text variant="caption" tone="muted">
            {t({
              id: 'setup.budget.infeasible.line',
              message: 'Nobody’s named. A few ways to bring the trip within everyone’s reach:',
            })}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.space.gap8,
              marginTop: theme.space.gap8,
            }}
          >
            <Button
              alignSelf="auto"
              size="small"
              variant="control"
              label={t({ id: 'setup.budget.infeasible.dates', message: 'Cheaper dates' })}
              onPress={props.onCheaperDates}
              testID="budget-infeasible-dates"
            />
            <Button
              alignSelf="auto"
              size="small"
              variant="control"
              label={t({ id: 'setup.budget.infeasible.shorter', message: 'A shorter trip' })}
              onPress={props.onCheaperDates}
              testID="budget-infeasible-shorter"
            />
            <Button
              alignSelf="auto"
              size="small"
              variant="control"
              label={t({ id: 'setup.budget.infeasible.hostels', message: 'Mix in hostels' })}
              onPress={() => setPick({ picked: track.minMinor, typed })}
              testID="budget-infeasible-hostels"
            />
          </View>
        </Card>
      ) : null}
      <BudgetBreakdown parts={split} locale={locale} currency={currency} />
      {track === null ? null : (
        <Card padded>
          <Text variant="label" tone="muted">
            {band.of <= 1
              ? t({ id: 'setup.budget.typed.labelAlone', message: 'Or type an amount' })
              : t({ id: 'setup.budget.typed.label', message: 'Or type an amount, each' })}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap6 }}>
            <Text variant="title">{currencySymbol(locale, currency)}</Text>
            <TextInput
              value={typed}
              onChangeText={(text) =>
                setPick({ picked: typedAmountMinor(text, currency) ?? picked, typed: text })
              }
              keyboardType="number-pad"
              returnKeyType="done"
              selectionColor={theme.color.caret}
              accessibilityLabel={t({
                id: 'setup.budget.typed.label',
                message: 'Or type an amount, each',
              })}
              testID="budget-typed"
              style={[
                theme.type.field,
                { color: theme.color.ink, flex: 1, padding: 0, height: 44 },
              ]}
            />
          </View>
          <Text variant="captionMuted" tone="muted">
            {t({
              id: 'setup.budget.typed.hint',
              message: `Rounds to steps of ${money(locale, track.stepMinor, currency)}.`,
            })}
          </Text>
        </Card>
      )}
      {band.of <= 1 ? null : (props.ownMax ?? null)}
    </StepPage>
  );
}
