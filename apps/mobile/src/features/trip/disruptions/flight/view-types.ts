import type { FlightModel } from './model';
import type { GuideStickerId } from '@/ui/avatar/guides';
import type { DisruptionAction } from '@cp/domain';

export interface FlightViewProps {
  readonly state: 'loading' | 'missing' | 'ready';
  readonly model: FlightModel | null;
  readonly eyebrow: string;
  readonly heroLines: readonly [string, string | null];
  readonly detail: string;
  readonly guide: GuideStickerId;
  readonly guideName: string;
  readonly tz: string;
  readonly offline: boolean;
  readonly joinIndex: (uid: string) => number;
  readonly onAnswer: (actionId: string, decision: 'approve' | 'keep') => void;
  readonly onTellCrew: () => void;
  readonly onUndoAll: () => void;
  readonly onOpenLink: (row: DisruptionAction) => void;
  readonly onBack: () => void;
  readonly telling?: boolean;
}
