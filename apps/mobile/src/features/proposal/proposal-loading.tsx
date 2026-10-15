/**
 * The proposal screens before their rows can be drawn. While reading, and for a short while after a
 * read came back empty (a push or a link can open a proposal before this phone has synced it, and
 * the screen holds its trip so it arrives), a skeleton under a back control. A proposal that still
 * is not here after that wait says so, with a way out.
 */
import type { Href } from 'expo-router';

import { PremiumProposalLoading } from './premium/proposal-loading';
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
  return <PremiumProposalLoading missing={notHere} fallback={fallback} testID={testID} />;
}
