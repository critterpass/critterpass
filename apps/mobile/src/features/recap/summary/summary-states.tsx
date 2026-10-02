/**
 * The recap page before it has numbers to show: the guide still writing it (queued or building),
 * the build failed (one way forward: try again), or the rows not read yet (a skeleton of the tiles).
 * Undesigned; built from the empty-state pattern the rest of the app uses.
 */
import { useLingui } from '@lingui/react/macro';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';

import type { SummaryPhase } from './summary-model';

const STICKER_SIZE = 120;

export interface SummaryStateProps {
  readonly phase: Exclude<SummaryPhase, 'ready'>;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}

export function SummaryState({ phase, guide, guideName, retrying, onRetry }: SummaryStateProps) {
  const { t } = useLingui();
  const art = GUIDE_STICKERS[guide];
  if (phase === 'loading') {
    return (
      <Skeleton
        preset="card"
        repeat={2}
        testID="recap-loading"
        label={t({ id: 'recap.summary.loading', message: 'Loading your recap' })}
      />
    );
  }
  if (phase === 'writing') {
    return (
      <EmptyState
        testID="recap-writing"
        guide={guide}
        guideName={guideName}
        sticker={<Sticker kind={art.kind} name={guideName} size={STICKER_SIZE} pose="idle" />}
        title={t({
          id: 'recap.summary.writing.title',
          message: `${guideName} is writing your recap`,
        })}
        line={t({
          id: 'recap.summary.writing.line',
          message: "Counting the kilometres and the photos. I'll ping you when it's ready.",
        })}
      />
    );
  }
  return (
    <EmptyState
      testID="recap-failed"
      guide={guide}
      guideName={guideName}
      sticker={<Sticker kind={art.kind} name={guideName} size={STICKER_SIZE} pose="idle" />}
      title={t({ id: 'recap.summary.failed.title', message: "The recap didn't come together" })}
      line={t({
        id: 'recap.summary.failed.line',
        message: 'Something went wrong on my side. Nothing from the trip is lost. Try again?',
      })}
      action={{
        label: retrying
          ? t({ id: 'recap.summary.failed.retrying', message: 'Asking again…' })
          : t({ id: 'recap.summary.failed.retry', message: 'Try again' }),
        onPress: onRetry,
      }}
    />
  );
}
