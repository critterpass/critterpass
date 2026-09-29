/**
 * What a budget target may be checked against (3c-5). The organiser's lock consults only the
 * crew-level band, which the crew already sees, so a lock answer never says more than the band:
 * below four maxes it consults nothing, above the band it answers `over_band` with no distance,
 * and with no sweet spot at all it answers `infeasible` for every target. A member's own fit
 * compares their own max with the target and is shown to that member alone.
 */
import { type Money } from '../money/money';
import { type BudgetBand } from './band';

export type LockCheck =
  | { readonly ok: true; readonly checkedAgainstBand: boolean }
  | { readonly ok: false; readonly reason: 'off_step' | 'over_band' | 'infeasible' };

/** Targets move in whole steps ($50 in the trip currency), never an exact amount. */
export function isOnStep(target: Money, stepMinor: bigint): boolean {
  return stepMinor > 0n && target.amountMinor > 0n && target.amountMinor % stepMinor === 0n;
}

export function checkLockTarget(target: Money, band: BudgetBand, stepMinor: bigint): LockCheck {
  if (!isOnStep(target, stepMinor)) return { ok: false, reason: 'off_step' };
  switch (band.state) {
    case 'waiting':
      return { ok: true, checkedAgainstBand: false };
    case 'no_sweet_spot':
      return { ok: false, reason: 'infeasible' };
    case 'band':
      return target.amountMinor <= band.high.amountMinor
        ? { ok: true, checkedAgainstBand: true }
        : { ok: false, reason: 'over_band' };
  }
}

/** "✓ UNDER ALL N MAXES": every member has a max in and the target sits inside the band. */
export function isUnderAll(target: Money, band: BudgetBand): boolean {
  return band.state === 'band' && band.underAll && target.amountMinor <= band.high.amountMinor;
}

/** Only from four maxes: the lowest max sits below the cheapest workable plan. */
export function isInfeasible(band: BudgetBand): boolean {
  return band.state === 'no_sweet_spot';
}

export type OwnFit = 'no_max' | 'no_target' | 'fits' | 'over';

/** The caller's own fit: their max (trip currency) against the organiser's current target. */
export function ownFit(ownMax: Money | null, target: Money | null): OwnFit {
  if (ownMax === null) return 'no_max';
  if (target === null) return 'no_target';
  if (ownMax.currency !== target.currency) throw new Error('own fit needs one currency');
  return target.amountMinor <= ownMax.amountMinor ? 'fits' : 'over';
}
