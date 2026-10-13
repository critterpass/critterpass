import type { ReactNode } from 'react';
import type { Decision } from './decision-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

export interface DecideViewProps {
  readonly eyebrow: string;
  readonly here: readonly string[];
  readonly decision: Decision | null;
  readonly members: readonly PlanMember[];
  readonly browsing: ReadonlyMap<string, readonly PlanMember[]>;
  readonly voteTokens: ReadonlyMap<string, number>;
  readonly onVote: (optionId: string) => void;
  /** The organiser can put the pick on the plan once the vote closes. */
  readonly onApply: (() => void) | null;
  readonly thread: ReactNode;
  readonly composer: ReactNode;
  readonly onBack?: () => void;
}
