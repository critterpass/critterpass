/**
 * A member's budget step (undesigned; from the 3n-2 "Budget max" row and the keypad pattern): the
 * private max, in their own currency, typed once and sent write-only. Nobody sees it: not the
 * organiser, not the guide. Once in, the screen shows only "Set ✓ · change" and the member's own
 * fit against the organiser's target; the value itself comes back only into their own change form.
 */
import type { FxContext } from '@cp/cost-engine';
import type { OwnFitState } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { applyKey, Keypad } from '@/ui/inputs/Keypad';
import { KeypadAmount } from '@/ui/inputs/KeypadAmount';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ShellFrame } from '../shell/frame';
import { DoneTag } from '../shell/header-tag';
import { SetupShell } from '../shell/setup-shell';
import { approxIn } from './fx-preview';
import { currencySymbol, fractionDigits, money } from './model';

export interface PrivateMaxModel {
  readonly state: 'loading' | 'entry' | 'set';
  readonly queued: boolean;
  readonly fit: OwnFitState | null;
  /** The currency the member types in (their saved default's, else their home currency). */
  readonly entryCurrency: string;
  readonly tripCurrency: string;
  readonly fx: FxContext | undefined;
  /** Whole units to start from: their own value when changing, else their saved default. */
  readonly prefill: number | null;
  readonly counts: { readonly set: number; readonly of: number };
}

export interface PrivateMaxViewProps {
  readonly shell: ShellFrame;
  readonly dates: string | null;
  readonly model: PrivateMaxModel;
  readonly onSave: (amountMinor: number, currency: string, everyTrip: boolean) => void;
  readonly onChange: () => void;
}

/** Digits the keypad amount shows at full size inside the card. */
const FIT_DIGITS = 7;

const useStyles = makeStyles((th) => ({
  card: { padding: th.space['16'], gap: th.space['12'] },
  row: { gap: th.space['8'] },
  grow: { flex: 1 },
}));

function fitLine(fit: OwnFitState | null): string | null {
  switch (fit) {
    case 'fits':
      return t({ id: 'setup.budget.fit.fits', message: 'The group’s target fits your max.' });
    case 'over':
      return t({
        id: 'setup.budget.fit.over',
        message: 'The group’s target is over your max. You can tell the crew if you like.',
      });
    case 'no_target':
      return t({ id: 'setup.budget.fit.noTarget', message: 'No group target yet.' });
    case 'no_max':
    case null:
      return null;
  }
}

export function PrivateMaxView({ shell, dates, model, onSave, onChange }: PrivateMaxViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [digits, setDigits] = useState(model.prefill === null ? '' : String(model.prefill));
  const [everyTrip, setEveryTrip] = useState(false);
  const whole = digits === '' ? 0 : Number(digits);
  const amountMinor = whole * 10 ** fractionDigits(model.entryCurrency);
  const approx =
    model.entryCurrency === model.tripCurrency || whole === 0
      ? undefined
      : approxIn(locale, amountMinor, model.entryCurrency, model.tripCurrency, model.fx);
  const { set, of } = model.counts;
  const everyTripLabel = t({
    id: 'setup.budget.member.everyTrip',
    message: 'Use this for every trip',
  });
  const tag = dates === null ? undefined : <DoneTag label={dates} />;
  const title = t({ id: 'setup.budget.member.title', message: 'What’s your max?' });
  const line = t({
    id: 'setup.budget.member.line',
    message: 'The most you’d spend on this trip, all in. Only you ever see it.',
  });

  if (model.state === 'loading') {
    return (
      <SetupShell {...shell} tag={tag} title={title} line={line} testID="budget-member">
        <Skeleton
          preset="card"
          label={t({ id: 'setup.budget.member.loading', message: 'Loading' })}
        />
      </SetupShell>
    );
  }

  if (model.state === 'set') {
    const fit = fitLine(model.fit);
    return (
      <SetupShell {...shell} tag={tag} title={title} line={line} testID="budget-member-set">
        <Card style={styles.card}>
          <Row justify="space-between" align="center" style={styles.row}>
            <Text variant="rowTitle" style={styles.grow}>
              {t({ id: 'setup.budget.member.yourMax', message: 'Your max' })}
            </Text>
            <Text
              variant="label"
              color={theme.semantic.state.success}
              testID="budget-member-set-mark"
            >
              {t({ id: 'setup.budget.member.set', message: 'Set ✓' })}
            </Text>
            <TextLink
              label={t({ id: 'setup.budget.member.change', message: 'change' })}
              onPress={onChange}
              testID="budget-member-change"
            />
          </Row>
          {model.queued ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'setup.budget.member.queued', message: 'Sends when you’re back online.' })}
            </Text>
          ) : null}
          {fit === null ? null : (
            <Text variant="body" testID="budget-member-fit">
              {fit}
            </Text>
          )}
        </Card>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({ id: 'setup.budget.member.counted', message: `${set} of ${of} maxes are in.` })}
        </Text>
      </SetupShell>
    );
  }

  return (
    <SetupShell
      {...shell}
      tag={tag}
      title={title}
      line={line}
      testID="budget-member-entry"
      footer={
        <PillButton
          label={t({ id: 'setup.budget.member.save', message: 'Save my max' })}
          onPress={() => onSave(amountMinor, model.entryCurrency, everyTrip)}
          disabled={whole === 0}
          testID="budget-member-save"
        />
      }
    >
      <Card style={styles.card}>
        <Text variant="eyebrow">
          {t({ id: 'setup.budget.member.eyebrow', message: 'Budget max' })}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'setup.budget.member.never',
            message: 'Never shown to anyone, guides included',
          })}
        </Text>
        {/* Long amounts (dong, rupiah) scale down to stay inside the card. */}
        <View style={{ transform: [{ scale: Math.min(1, FIT_DIGITS / String(whole).length) }] }}>
          <KeypadAmount
            value={whole}
            currency={currencySymbol(locale, model.entryCurrency)}
            {...(approx === undefined ? {} : { approx })}
            label={money(locale, amountMinor, model.entryCurrency)}
          />
        </View>
      </Card>
      <Keypad onKey={(key) => setDigits((current) => applyKey(current, key, 9))} />
      <Row justify="space-between" align="center" style={styles.row}>
        <Text variant="rowTitle" style={styles.grow}>
          {everyTripLabel}
        </Text>
        <Toggle
          value={everyTrip}
          onValueChange={setEveryTrip}
          label={everyTripLabel}
          testID="budget-member-every-trip"
        />
      </Row>
    </SetupShell>
  );
}
