/**
 * The budget step, connected: synced rows for the crew-level row and the price inputs, the band
 * route re-read on mount and on every budget hint, the member's own max from their own device, and
 * the commands. The organiser gets the sweet-spot view (with a row for their own max); everyone
 * else gets the write-only form.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire codes, never copy. */
import { fxContextOf } from '@cp/cost-engine';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  lockBudgetTargetCommand,
  setBudgetDefaultCommand,
  setSetupStepCommand,
  submitBudgetMaxCommand,
} from '../data/commands';
import { useLiveRows } from '../data/rows';
import { useSetupServices } from '../data/services';
import { useSetupHints } from '../data/use-setup-channel';
import type { StepProps } from '../shell/frame';
import { BudgetView, type LockState } from './budget-view';
import { useBudgetInputs } from './data/use-budget-inputs';
import { saveOwnMax, useOwnMax } from './data/private-max';
import { datesLabel } from './labels';
import {
  bandView,
  estimatesOf,
  fractionDigits,
  initialTarget,
  rowFromBandWire,
  trackOf,
  type AggregateRow,
} from './model';
import { OwnMaxRow } from './own-max-row';
import { PrivateMaxView } from './private-max-view';

const HOME_SQL = 'SELECT home_currency FROM users WHERE id = ?';

export function lockOutcome(
  sent: Awaited<ReturnType<ReturnType<typeof useCommand>['send']>>,
  attempt: number,
): LockState | 'done' {
  if (sent.kind === 'applied' || sent.kind === 'queued') return 'done';
  if (sent.code === 'RATE_LIMITED') return { kind: 'rate_limited' };
  if (sent.kind === 'unavailable') return { kind: 'offline' };
  const reason = (sent.detail as { reason?: unknown } | undefined)?.reason;
  if (sent.code === 'STATE_INVALID' && reason === 'over_band')
    return { kind: 'over_band', attempt };
  return { kind: 'failed' };
}

export function BudgetStep({ trip, shell }: StepProps) {
  const locale = useLocale();
  const { db } = useLocalFirst();
  const services = useSetupServices();
  const inputs = useBudgetInputs(trip.tripId);
  const own = useOwnMax(trip.tripId);
  const home = useLiveRows<{ home_currency: string | null }>(HOME_SQL, [trip.me], ['users']);
  const lockCmd = useCommand(lockBudgetTargetCommand);
  const submit = useCommand(submitBudgetMaxCommand);
  const usual = useCommand(setBudgetDefaultCommand);
  const step = useCommand(setSetupStepCommand);
  const [fresh, setFresh] = useState<AggregateRow | null>(null);
  const [lock, setLock] = useState<LockState>({ kind: 'idle' });
  const [attempts, setAttempts] = useState(0);
  const [editing, setEditing] = useState(false);

  const readBand = useCallback(() => {
    void services
      .getJson(`/v1/budget/${encodeURIComponent(trip.tripId)}/band`)
      .then((read) => {
        if (read.kind === 'ok') setFresh(rowFromBandWire(read.body));
        else if (read.kind === 'error' && read.code === 'K_ANON_UNAVAILABLE') setFresh(null);
      })
      .catch(() => undefined);
  }, [services, trip.tripId]);
  useEffect(readBand, [readBand]);
  useSetupHints(trip.tripId, (hint) => {
    if (hint === null || hint.type === 'budget.band' || hint.type === 'budget.count') readBand();
  });

  const row = fresh ?? inputs.aggregate;
  const band = bandView(row, trip.members.length);
  const estimates = useMemo(() => estimatesOf(inputs.source), [inputs.source]);
  const track = trackOf(band, estimates, row);
  const currency = row?.currency ?? inputs.source?.currency ?? 'USD';
  const dates = datesLabel(locale, trip.startDate, trip.endDate);
  const counts = { set: band.set, of: band.of };

  if (!trip.isOrganiser || editing) {
    const entryCurrency =
      (editing ? own.own?.currency : undefined) ??
      own.usual?.currency ??
      home.rows[0]?.home_currency ??
      currency;
    const prefillMinor = editing
      ? (own.own?.amountMinor ?? null)
      : (own.usual?.amountMinor ?? null);
    const state = !own.loaded ? 'loading' : own.set && !editing ? 'set' : 'entry';
    return (
      <PrivateMaxView
        key={`${state}:${prefillMinor ?? ''}`}
        shell={shell}
        dates={dates}
        model={{
          state,
          queued: own.queued,
          fit: own.fit,
          entryCurrency,
          tripCurrency: currency,
          fx: inputs.source === null ? undefined : fxContextOf(inputs.source),
          prefill:
            prefillMinor === null
              ? null
              : Math.round(prefillMinor / 10 ** fractionDigits(entryCurrency)),
          counts,
        }}
        onChange={() => setEditing(true)}
        onSave={(amountMinor, entry, everyTrip) => {
          const value = { amountMinor, currency: entry };
          void submit
            .send({
              trip_id: trip.tripId,
              amount_minor: amountMinor,
              currency: entry,
              source: 'entered',
            })
            .then(() => saveOwnMax(db, trip.tripId, value, new Date(services.now())));
          if (everyTrip) void usual.send({ amount_minor: amountMinor, currency: entry });
          setEditing(false);
        }}
      />
    );
  }

  return (
    <BudgetView
      key={inputs.loaded ? 'ready' : 'loading'}
      shell={shell}
      trip={trip}
      dates={dates}
      band={band}
      track={track}
      currency={currency}
      estimates={estimates}
      estimatesLoading={!inputs.loaded}
      initialTarget={initialTarget(band, track, inputs.lockedTargetMinor)}
      lock={lock}
      ownMax={<OwnMaxRow set={own.set} onChange={() => setEditing(true)} />}
      onLock={(target) => {
        const attempt = attempts + 1;
        setAttempts(attempt);
        setLock({ kind: 'locking' });
        void lockCmd.send({ trip_id: trip.tripId, target_minor: target }).then((sent) => {
          const outcome = lockOutcome(sent, attempt);
          if (outcome === 'done') {
            setLock({ kind: 'idle' });
            shell.onSelectStep('rooms');
          } else setLock(outcome);
        });
      }}
      onSkip={
        trip.members.length < 2
          ? () => {
              void step.send({ trip_id: trip.tripId, step: 'rooms' });
              shell.onSelectStep('rooms');
            }
          : null
      }
      onCheaperDates={() => shell.onSelectStep('when')}
    />
  );
}
