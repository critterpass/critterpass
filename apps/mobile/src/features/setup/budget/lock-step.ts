/**
 * The step the budget knob moves in. The server is its only authority ($50 in the crew currency,
 * two significant digits): the app takes the server's word wherever it has it, derives the same
 * figure from synced rates when it does not, and never guesses a dollar-sized step for another
 * currency. Everything here is a public price fact; no max is involved.
 */
import {
  assertCurrencyCode,
  bandStepMinor,
  convertWith,
  type BudgetEstimates,
} from '@cp/cost-engine';

import type { SendResult } from '@/data/commands/client';

import type { ApiRead } from '../data/services';

/** The crew currency and step a target must sit on, as the server said them. */
export interface LockGrid {
  readonly currency: string;
  readonly stepMinor: number;
}

function gridOf(value: unknown): LockGrid | null {
  const wire = value as { currency?: unknown; step_minor?: unknown } | null | undefined;
  if (wire === null || wire === undefined || typeof wire !== 'object') return null;
  const { currency, step_minor: step } = wire;
  return typeof currency === 'string' && typeof step === 'number' && step > 0
    ? { currency, stepMinor: step }
    : null;
}

/** The grid in a band read: the band's own body, or the detail of "not enough maxes yet". */
export function gridFromBandRead(read: ApiRead): LockGrid | null {
  if (read.kind === 'ok') return gridOf(read.body);
  return read.kind === 'error' && read.code === 'K_ANON_UNAVAILABLE' ? gridOf(read.detail) : null;
}

/** The server's step when a lock was refused for sitting off it, else null. */
export function offStepOf(sent: SendResult): number | null {
  if (sent.kind !== 'rejected' || sent.code !== 'VALIDATION') return null;
  const detail = sent.detail as { reason?: unknown; step_minor?: unknown } | null | undefined;
  const step = detail?.step_minor;
  return detail?.reason === 'off_step' && typeof step === 'number' && step > 0 ? step : null;
}

function ceilTwoSignificant(value: bigint): bigint {
  let scale = 1n;
  while (value / scale >= 100n) scale *= 10n;
  return ((value + scale - 1n) / scale) * scale;
}

/**
 * A stand-in of the right size when the server has not answered and the device holds no dollar
 * rate: fifty of whatever the synced rates are based on, in the crew currency. A lock made on it
 * is corrected by the server's own step (see `offStepOf`).
 */
function standInStep(estimates: BudgetEstimates): number | null {
  const base = estimates.fx?.snapshots[0]?.base;
  if (base === undefined) return null;
  try {
    const fifty = convertWith(
      { amountMinor: 5_000n, currency: base },
      assertCurrencyCode(estimates.currency),
      estimates.fx,
    );
    return fifty.amountMinor > 0n ? Number(ceilTwoSignificant(fifty.amountMinor)) : null;
  } catch {
    return null;
  }
}

export interface StepInputs {
  /** A step the server answered a refused lock with: its latest word. */
  readonly adopted: number | null;
  /** The band read's step, else the synced crew-level row's. */
  readonly server: number | null;
  readonly currency: string;
  readonly estimates: BudgetEstimates | null;
  /** The band read has answered (or failed), so nothing better is on its way. */
  readonly bandAnswered: boolean;
}

/** The knob's step, or null while it is not known (the step then shows its loading state). */
export function stepOf(inputs: StepInputs): number | null {
  if (inputs.adopted !== null) return inputs.adopted;
  if (inputs.server !== null && inputs.server > 0) return inputs.server;
  const { estimates } = inputs;
  if (estimates?.currency === inputs.currency) {
    try {
      return Number(bandStepMinor(estimates.currency, estimates.fx));
    } catch {
      // No dollar rate on this device yet.
    }
  }
  if (inputs.currency === 'USD') return Number(bandStepMinor('USD'));
  return inputs.bandAnswered && estimates?.currency === inputs.currency
    ? standInStep(estimates)
    : null;
}
