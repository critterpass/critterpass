/**
 * The organiser's budget step (3c-5), as a pure view: the sweet-spot card, the breakdown that
 * re-flows with the knob, a field to type the amount instead of dragging to it, and LOOKS GOOD. From four maxes the knob is checked against the band
 * (above it the check turns to a warning and LOOKS GOOD waits); below four, the count is all
 * anyone sees and the lock consults no max. When the lowest max sits under the cheapest plan, an
 * anonymous notice offers ways out instead.
 */
import type { BudgetEstimates } from '@cp/cost-engine';
import { BUDGET_K_MIN } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useMemo, useState, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Card } from '@/ui/cards/Card';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SetupTrip } from '../data/setup-trip';
import type { ShellFrame } from '../shell/frame';
import { DoneTag } from '../shell/header-tag';
import { SetupShell } from '../shell/setup-shell';
import { BreakdownBars, type BarsState } from './breakdown-bars';
import {
  barsFor,
  currencySymbol,
  money,
  snap,
  typedAmountMinor,
  widenTrack,
  type BandView,
  type Track,
} from './model';
import { isOverBand, SweetSpotCard } from './sweet-spot-card';
import { useShake } from './use-shake';

export type LockState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'locking' }
  | { readonly kind: 'over_band'; readonly attempt: number }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'offline' }
  /** The crew currency has no rate today, so there is no step to lock a target on. */
  | { readonly kind: 'no_rates' }
  | { readonly kind: 'failed' };

export interface BudgetViewProps {
  readonly shell: ShellFrame;
  readonly trip: SetupTrip;
  readonly dates: string | null;
  readonly band: BandView;
  /** Null while the crew's step is not known yet: the step waits, priced, with no knob. */
  readonly track: Track | null;
  readonly currency: string;
  readonly estimates: BudgetEstimates | null;
  readonly estimatesLoading: boolean;
  readonly initialTarget: number;
  readonly lock: LockState;
  readonly onLock: (targetMinor: number) => void;
  /** Present when the crew is too small for a budget step. */
  readonly onSkip: (() => void) | null;
  readonly onCheaperDates: () => void;
  /** The organiser's own max row. */
  readonly ownMax?: ReactNode;
  /** The pick, when the step keeps it (it then outlives this view); else the view keeps its own. */
  readonly pick?: BudgetPick | undefined;
  readonly onPick?: ((pick: BudgetPick) => void) | undefined;
}

/** What the organiser has picked so far: the knob's amount once moved, and the typed text. */
export interface BudgetPick {
  readonly picked: number | null;
  readonly typed: string;
}

export const EMPTY_PICK: BudgetPick = { picked: null, typed: '' };

const useStyles = makeStyles((th) => ({
  notice: { padding: th.space['16'], gap: th.space['10'] },
  options: { flexWrap: 'wrap', gap: th.space['8'] },
  cta: { alignSelf: 'stretch' },
}));

function lockLine(lock: LockState): string | null {
  switch (lock.kind) {
    case 'over_band':
      return t({
        id: 'setup.budget.lock.overBand',
        message: 'That’s above someone’s max. Slide it down into the band.',
      });
    case 'rate_limited':
      return t({
        id: 'setup.budget.lock.rateLimited',
        message: 'Too many tries for now. Give it an hour.',
      });
    case 'offline':
      return t({
        id: 'setup.budget.lock.offline',
        message: 'Locking needs signal. Your pick stays here.',
      });
    case 'no_rates':
      return t({
        id: 'setup.budget.lock.noRates',
        message:
          'Today’s rate for your crew’s currency isn’t in yet, so this can’t lock. Try again in a bit.',
      });
    case 'failed':
      return t({ id: 'setup.budget.lock.failed', message: 'That didn’t lock. Try again.' });
    case 'idle':
    case 'locking':
      return null;
  }
}

export function BudgetView(props: BudgetViewProps) {
  const { shell, trip, band, currency, lock } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  // Until the organiser moves the knob it follows the suggested start, which moves as prices and
  // the step arrive; after that it is theirs. Either way it sits on the track it is shown on.
  const [ownPick, setOwnPick] = useState<BudgetPick>(EMPTY_PICK);
  const { picked, typed } = props.pick ?? ownPick;
  const setPick = props.onPick ?? setOwnPick;
  // An amount typed above the end of the track stretches it (where no band limits the pick).
  const track = props.track === null ? null : widenTrack(props.track, band, picked);
  const target = track === null ? 0 : snap(picked ?? props.initialTarget, track);
  const onTyped = (text: string) => {
    const amount = typedAmountMinor(text, currency);
    setPick({ picked: amount ?? picked, typed: text });
  };
  const shake = useShake(lock.kind === 'over_band' ? lock.attempt : 0);
  const over = isOverBand(band, target);
  const barsState: BarsState = useMemo(() => {
    if (props.estimatesLoading || track === null) return { kind: 'loading' };
    const bars = barsFor(target, props.estimates);
    return bars === null ? { kind: 'missing' } : { kind: 'ready', bars };
  }, [props.estimatesLoading, props.estimates, target, track]);
  const guide = guideSticker(trip.guide).name;
  const line =
    band.kind === 'waiting'
      ? band.of <= 1
        ? // A trip of one: there is no crew to fit and nobody to keep a max from.
          t({
            id: 'setup.budget.lineAlone',
            message: 'Pick what feels comfy for this trip. It guides what gets suggested.',
          })
        : band.of < BUDGET_K_MIN
          ? // A crew under four never gets a band: the organiser picks, and each max stays private.
            t({
              id: 'setup.budget.lineSmallCrew',
              message:
                'Pick what feels comfy for the crew. Each max stays private, and everyone sees if your pick fits theirs.',
            })
          : t({
              id: 'setup.budget.lineWaiting',
              message: 'Everyone sets a private max. The band shows once four are in.',
            })
      : t({
          id: 'setup.budget.line',
          message: `Everyone set a private max. Nobody sees anyone else’s number, including ${guide}.`,
        });
  const message = lockLine(lock);
  const infeasible = band.kind === 'infeasible';

  return (
    <SetupShell
      {...shell}
      tag={props.dates === null ? undefined : <DoneTag label={props.dates} />}
      title={t({ id: 'setup.budget.title', message: 'What feels comfy?' })}
      line={line}
      testID="budget-step"
      footer={
        <>
          {message === null ? null : (
            <Text variant="bodySm" color={theme.semantic.state.urgent} testID="budget-lock-line">
              {message}
            </Text>
          )}
          <Animated.View style={[styles.cta, shake]}>
            <PillButton
              label={t({ id: 'setup.budget.cta', message: 'Looks good' })}
              onPress={() => props.onLock(target)}
              disabled={over || infeasible || track === null}
              loading={lock.kind === 'locking'}
              flap
              testID="budget-lock"
            />
          </Animated.View>
          {props.onSkip === null ? null : (
            <TextLink
              label={t({ id: 'setup.budget.skip', message: 'Skip the budget' })}
              onPress={props.onSkip}
              testID="budget-skip"
            />
          )}
        </>
      }
    >
      {track === null ? null : (
        <SweetSpotCard
          band={band}
          track={track}
          currency={currency}
          target={target}
          onTarget={(next) => setPick({ picked: next, typed: '' })}
        />
      )}
      {/* Why the button is dimmed, and the ways out, before anything that can scroll under it. */}
      {infeasible && track !== null ? (
        <Card style={styles.notice} testID="budget-infeasible">
          <Text variant="title">
            {t({
              id: 'setup.budget.infeasible.title',
              message: 'One budget is below the cheapest plan',
            })}
          </Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {t({
              id: 'setup.budget.infeasible.line',
              message: 'Nobody’s named. A few ways to bring the trip within everyone’s reach:',
            })}
          </Text>
          <Row style={styles.options}>
            <InlineAction
              label={t({ id: 'setup.budget.infeasible.dates', message: 'Cheaper dates' })}
              onPress={props.onCheaperDates}
              testID="budget-infeasible-dates"
            />
            <InlineAction
              label={t({ id: 'setup.budget.infeasible.shorter', message: 'A shorter trip' })}
              onPress={props.onCheaperDates}
              testID="budget-infeasible-shorter"
            />
            <InlineAction
              label={t({ id: 'setup.budget.infeasible.hostels', message: 'Mix in hostels' })}
              onPress={() => setPick({ picked: track.minMinor, typed })}
              testID="budget-infeasible-hostels"
            />
          </Row>
        </Card>
      ) : null}
      {track === null ? null : (
        <TextField
          label={
            band.of <= 1
              ? t({ id: 'setup.budget.typed.labelAlone', message: 'Or type an amount' })
              : t({ id: 'setup.budget.typed.label', message: 'Or type an amount, each' })
          }
          value={typed}
          onChangeText={onTyped}
          keyboardType="number-pad"
          returnKeyType="done"
          leading={<Text variant="title">{currencySymbol(locale, currency)}</Text>}
          message={t({
            id: 'setup.budget.typed.hint',
            message: `Rounds to steps of ${money(locale, track.stepMinor, currency)}.`,
          })}
          testID="budget-typed"
        />
      )}
      <BreakdownBars state={barsState} target={target} currency={currency} />
      {/* Her own max is for fitting a crew's pick; alone, the pick is hers already. */}
      {band.of <= 1 ? null : (props.ownMax ?? null)}
    </SetupShell>
  );
}
