/**
 * Your private max and how you sleep (4.17): "Just for you" with the amount (typed on the number
 * pad, shown in the trip's money when it differs), how you like to sleep (share a room, a room of
 * your own, don't mind) and what the guide should know (light sleeper, early riser, night owl,
 * snoring, ground floor), saved privately. Nobody sees the amount; once it is in, the page says so
 * with a way to change it. The max goes through the shared `BudgetStep`; the sleep answers are the
 * member's room preferences.
 */
import { ROOM_CHIPS, type RoomSleepChoice } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  Card,
  LoadingCritter,
  Text,
  TextButton,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';

import type { PrivateMaxViewProps } from '../../budget/budget-props';
import { approxIn } from '../../budget/fx-preview';
import { currencySymbol, fractionDigits, money } from '../../budget/model';
import { setRoomPrefsCommand } from '../../data/commands';
import { parseIdList, useLiveRows } from '../../data/rows';
import { SleepChoices } from './sleep-choices';
import { ChecklistPill, StepHeadline, StepPage } from './step-parts';

type RoomChip = (typeof ROOM_CHIPS)[number];

/* eslint-disable lingui/no-unlocalized-strings -- SQL and chip keys, never copy. */
const PREFS_SQL = 'SELECT chips, sleep FROM room_prefs WHERE trip_id = ? AND user_id = ?';
const PREFS_TABLES = ['room_prefs'];
/* eslint-enable lingui/no-unlocalized-strings */

export function PremiumPrivateMaxView(
  props: PrivateMaxViewProps & { readonly tripId: string; readonly me: string },
) {
  const { model } = props;
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const prefs = useLiveRows<{ chips: string | null; sleep: string | null }>(
    PREFS_SQL,
    [props.tripId, props.me],
    PREFS_TABLES,
  );
  const savePrefs = useCommand(setRoomPrefsCommand);
  const [digits, setDigits] = useState(model.prefill === null ? '' : String(model.prefill));
  const [everyTrip, setEveryTrip] = useState(false);
  const stored = prefs.rows[0];
  const [sleep, setSleep] = useState<RoomSleepChoice | null>(null);
  const [chips, setChips] = useState<readonly string[] | null>(null);
  const shownSleep = sleep ?? (stored?.sleep as RoomSleepChoice | null | undefined) ?? null;
  const shownChips = chips ?? parseIdList(stored?.chips ?? null);
  const whole = digits === '' ? 0 : Number(digits);
  const amountMinor = whole * 10 ** fractionDigits(model.entryCurrency);
  const approx =
    model.entryCurrency === model.tripCurrency || whole === 0
      ? undefined
      : approxIn(locale, amountMinor, model.entryCurrency, model.tripCurrency, model.fx);
  const pill = (
    <ChecklistPill
      row="budget"
      done={model.state === 'set'}
      trailing={t({
        id: 'setup.premium.budget.member.counted',
        message: `${model.counts.set} of ${model.counts.of} maxes are in.`,
      })}
    />
  );
  const title = t({ id: 'setup.premium.max.title', message: 'Your private max' });
  const save = () => {
    props.onSave(amountMinor, model.entryCurrency, everyTrip);
    if (sleep !== null || chips !== null) {
      void savePrefs.send({
        trip_id: props.tripId,
        chips: shownChips.filter((chip): chip is RoomChip =>
          (ROOM_CHIPS as readonly string[]).includes(chip),
        ),
        ...(shownSleep === null ? {} : { sleep: shownSleep }),
      });
    }
  };
  if (model.state === 'loading') {
    return (
      <StepPage title={title} testID="budget-member">
        <LoadingCritter label={t({ id: 'setup.budget.member.loading', message: 'Loading' })} />
      </StepPage>
    );
  }
  if (model.state === 'set') {
    return (
      <StepPage title={title} testID="budget-member-set">
        {pill}
        <StepHeadline
          title={t({ id: 'setup.premium.max.in', message: 'Your max is in' })}
          line={t({
            id: 'setup.premium.max.inLine',
            message: 'Nobody sees it, not even the crew.',
          })}
        />
        {model.queued ? (
          <Text variant="caption" tone="muted">
            {t({ id: 'setup.budget.member.queued', message: 'Sends when you’re back online.' })}
          </Text>
        ) : null}
        <Button
          label={t({ id: 'setup.premium.max.change', message: 'Change my max' })}
          variant="secondary"
          onPress={props.onChange}
          testID="budget-member-change"
        />
      </StepPage>
    );
  }
  return (
    <StepPage
      title={title}
      testID="budget-member-entry"
      footer={
        <>
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={t({ id: 'setup.premium.max.save', message: 'Save privately' })}
              onPress={save}
              disabled={whole === 0}
              testID="budget-member-save"
            />
          </View>
          {props.onCancel === undefined ? null : (
            <TextButton
              label={t({ id: 'setup.budget.member.keep', message: 'Keep it as it is' })}
              onPress={props.onCancel}
              testID="budget-member-cancel"
            />
          )}
        </>
      }
    >
      {pill}
      <StepHeadline
        title={t({ id: 'setup.premium.max.headline', message: 'Just for you' })}
        line={t({
          id: 'setup.budget.member.line',
          message: 'The most you’d spend on this trip, all in. Only you ever see it.',
        })}
      />
      <Card padded>
        <Text variant="label" tone="muted">
          {t({ id: 'setup.premium.max.most', message: 'Most I’d spend, each' })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.space.gap4 }}>
          <Text variant="stat">{currencySymbol(locale, model.entryCurrency)}</Text>
          <TextInput
            value={digits}
            onChangeText={(text) => setDigits(text.replace(/\D/gu, '').slice(0, 9))}
            keyboardType="number-pad"
            returnKeyType="done"
            placeholder={String(0)}
            placeholderTextColor={theme.color.placeholder}
            selectionColor={theme.color.caret}
            accessibilityLabel={money(locale, amountMinor, model.entryCurrency)}
            testID="budget-member-amount"
            style={[theme.type.hero, { color: theme.color.ink, flex: 1, padding: 0 }]}
          />
        </View>
        {approx === undefined ? null : (
          <Text variant="caption" tone="muted">
            {approx}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.space.gap10 }}>
          <Text variant="rowText" style={{ flex: 1 }}>
            {t({ id: 'setup.budget.member.everyTrip', message: 'Use this for every trip' })}
          </Text>
          <Toggle
            value={everyTrip}
            onChange={setEveryTrip}
            accessibilityLabel={t({
              id: 'setup.budget.member.everyTrip',
              message: 'Use this for every trip',
            })}
            testID="budget-member-every-trip"
          />
        </View>
      </Card>
      <SleepChoices sleep={shownSleep} chips={shownChips} onSleep={setSleep} onChips={setChips} />
    </StepPage>
  );
}
