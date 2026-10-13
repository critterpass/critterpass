import type { RedraftReasonKey } from '@cp/domain';
import { type ReactNode } from 'react';
import type { GuideId } from '@/ui/people/GuideLine';
import type { ReviewDay } from '../data/version';

export interface ChangeDayViewProps {
  readonly guide: GuideId;
  readonly destination: string;
  readonly locale: string;
  readonly days: readonly ReviewDay[];
  readonly day: number;
  readonly onDay: (day: number) => void;
  readonly reasons: ReadonlySet<RedraftReasonKey>;
  readonly onReason: (reason: RedraftReasonKey) => void;
  readonly note: string;
  readonly onNote: (note: string) => void;
  /** Why the last try did not go, in words. */
  readonly problem: string | null;
  readonly counter: string | null;
  readonly sending: boolean;
  /** No free redrafts left: the boost offer replaces the button. */
  readonly spent: ReactNode | null;
  readonly onSubmit: () => void;
  readonly onClose?: () => void;
}
