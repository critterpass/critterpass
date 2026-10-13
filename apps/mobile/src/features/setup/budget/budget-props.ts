import type { BudgetEstimates, FxContext } from '@cp/cost-engine';
import { BUDGET_K_MIN, type OwnFitState } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { type ReactNode } from 'react';
import type { SetupTrip } from '../data/setup-trip';
import { type BandView, type Track } from './model';
import type { ShellFrame } from '../shell/frame';

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

export function lockLine(lock: LockState): string | null {
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

/** The step's line: what the maxes are for, and whether the crew's band is in yet. */
export function budgetLine(band: BandView, guide: string): string {
  return band.kind === 'waiting'
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
}

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
  /** Leaves a change form opened from a max already dealt with; absent on a first entry. */
  readonly onCancel?: (() => void) | undefined;
}
