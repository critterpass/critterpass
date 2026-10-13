import type { LateModel } from './model';
import type { GuideStickerId } from '@/ui/avatar/guides';
import type { LateOptionKind } from '@cp/domain';
import type { ReactNode } from 'react';

export interface LateViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: LateModel | null;
  /** The guide's line about why (in the reader's language). */
  readonly reason: string;
  /** Names of the late party, for whoever waits. */
  readonly lateNames: readonly string[];
  /** The map, or null when there is none to show (offline with no tiles). */
  readonly map: ReactNode | null;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onChoose: (option: LateOptionKind) => void;
  /** An option's line as the screen worked it out itself, in place of the planner's. */
  readonly details?: Partial<Record<LateOptionKind, string>> | undefined;
}
