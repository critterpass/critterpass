import { plural, t } from '@lingui/core/macro';
import type { GuideId } from '@/ui/people/GuideLine';
import { type DayCard, type DraftPhase, type StepRow } from '../data/job';

export interface DraftingViewProps {
  readonly guide: GuideId;
  readonly days: number;
  readonly phase: DraftPhase;
  readonly steps: readonly StepRow[];
  readonly dayCards: readonly DayCard[];
  /** The job is done and its result has been on screen long enough: fold away, then `onDone`. */
  readonly leaving: boolean;
  readonly onDone: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
  readonly onBack: () => void;
  readonly testID?: string;
}

export function titleFor(phase: DraftPhase, guideName: string, days: number): string {
  switch (phase.kind) {
    case 'failed':
      return t({ id: 'planDraft.drafting.failedTitle', message: `${guideName} couldn’t finish` });
    case 'cancelled':
      return t({ id: 'planDraft.drafting.stoppedTitle', message: 'Draft stopped' });
    case 'offline':
      return t({ id: 'planDraft.drafting.offlineTitle', message: 'Waiting for signal' });
    case 'blocked':
      return t({ id: 'planDraft.drafting.blockedTitle', message: 'Not quite ready' });
    case 'running':
    case 'starting':
    case 'done':
      return t({
        id: 'planDraft.drafting.title',
        message: plural(days, {
          one: `${guideName} is drafting your day`,
          other: `${guideName} is drafting your # days`,
        }),
      });
  }
}

export function lineFor(phase: DraftPhase, days: number): string {
  switch (phase.kind) {
    case 'running':
      return phase.slow
        ? t({
            id: 'planDraft.drafting.slow',
            message: 'Taking longer than usual. You can leave: I’ll tell you when it’s ready.',
          })
        : t({
            id: 'planDraft.drafting.line',
            message:
              'This takes a few minutes. You can leave: I’ll tell you when it’s ready, and you see it before anyone else.',
          });
    case 'offline':
      return t({
        id: 'planDraft.drafting.offline',
        message: plural(days, {
          one: 'I’ll start on your day as soon as you’re back online.',
          other: 'I’ll start on your # days as soon as you’re back online.',
        }),
      });
    case 'blocked':
      return phase.reason === 'dates_not_locked'
        ? t({ id: 'planDraft.drafting.noDates', message: 'Lock the dates first, then I’ll draft.' })
        : t({
            id: 'planDraft.drafting.blocked',
            message: 'I can’t start this draft yet. Finish setup and try again.',
          });
    case 'failed':
      return t({
        id: 'planDraft.drafting.failed',
        message: 'Nobody saw it and nothing was used up. Want me to try again?',
      });
    case 'cancelled':
      return t({
        id: 'planDraft.drafting.stopped',
        message: 'Nobody saw it. Start again whenever you like.',
      });
    case 'starting':
    case 'done':
      return t({
        id: 'planDraft.drafting.line',
        message:
          'This takes a few minutes. You can leave: I’ll tell you when it’s ready, and you see it before anyone else.',
      });
  }
}
