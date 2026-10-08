/**
 * The proposal screens before their rows can be drawn. While reading, and for a short while after a
 * read came back empty (a push or a link can open a proposal before this phone has synced it, and
 * the screen holds its trip so it arrives), a skeleton under a back control. A proposal that still
 * is not here after that wait says so, with a way out.
 */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { useStillMissing } from './use-still-missing';

export interface ProposalLoadingProps {
  /** The read has answered and what the screen is about is not on this phone. */
  readonly missing?: boolean | undefined;
  /** Where back lands when the screen was opened cold. @default Home */
  readonly fallback?: Href | undefined;
  readonly testID?: string | undefined;
}

export function ProposalLoading({
  missing = false,
  fallback,
  testID = 'proposal-loading',
}: ProposalLoadingProps) {
  const notHere = useStillMissing(missing);
  const backLabel = t({ id: 'proposal.loadingBack', message: 'Back' });
  if (notHere) {
    return (
      <ScreenMissing
        backLabel={backLabel}
        fallback={fallback}
        title={t({ id: 'proposal.missing.title', message: 'This proposal isn’t here' })}
        line={t({
          id: 'proposal.missing.line',
          message: 'It may have been replaced by a newer one, or this phone hasn’t got it yet.',
        })}
        testID="proposal-missing"
      />
    );
  }
  return (
    <ScreenLoading
      backLabel={backLabel}
      fallback={fallback}
      label={t({ id: 'proposal.loading', message: 'Loading the proposal' })}
      testID={testID}
    />
  );
}
