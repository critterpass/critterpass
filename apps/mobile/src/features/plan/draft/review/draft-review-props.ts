import type { GuideId } from '@/ui/people/GuideLine';
import type { RedraftQuota } from '../data/quota';
import type { ReviewModel } from '../data/version';
import { type MissedMustDo } from './review-words';

export interface DraftReviewViewProps {
  readonly guide: GuideId;
  readonly destination: string;
  readonly dates: string;
  readonly locale: string;
  readonly model: ReviewModel;
  readonly quota: RedraftQuota;
  readonly offline: boolean;
  /** A redraft waiting on the organiser (running, or delivered and not kept or put back). */
  readonly openRedraft: { readonly dayNo: number | null; readonly ready: boolean } | null;
  readonly hasHistory: boolean;
  readonly onBack: () => void;
  readonly onPropose: (() => void) | undefined;
  readonly onChangeDay: (free: boolean) => void;
  /** Opens the fix for a must-do that did not make the draft. */
  readonly onFixMiss?: ((miss: MissedMustDo) => void) | undefined;
  readonly onOpenDay: ((dayNo: number) => void) | undefined;
  readonly onOpenRedraft: () => void;
  readonly onHistory: () => void;
}
