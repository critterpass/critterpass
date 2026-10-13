import type { GuideId } from '@/ui/people/GuideLine';
import type { ChangeCard as ChangeCardModel, MetricChip } from '../data/redraft';

import type { LeftOut } from '../data/left-out';

export type DiffPhase = 'thinking' | 'ready' | 'identical' | 'failed' | 'settled';

export interface RedraftDiffViewProps {
  readonly guide: GuideId;
  readonly locale: string;
  readonly tz: string;
  readonly phase: DiffPhase;
  /** While thinking: slow or offline adds a line saying so. @default 'working' */
  readonly wait?: RedraftWait | undefined;
  readonly dayNo: number | null;
  /** The guide's own summary (written in English: passed only to a reader of English). */
  readonly summary: string | null;
  /** The changes left ticked would put two stops at the same time: keeping waits. */
  readonly clash?: boolean;
  readonly cards: readonly ChangeCardModel[];
  readonly chips: readonly MetricChip[];
  readonly off: ReadonlySet<string>;
  readonly baseTitle: string | null;
  readonly sending: boolean;
  readonly onToggle: (key: string) => void;
  readonly onKeep: () => void;
  readonly onPutBack: () => void;
  readonly onBack: () => void;
  /** Essential places the redraft takes out of the trip. */
  readonly takenOut?: readonly LeftOut[] | undefined;
  readonly onBoost: (() => void) | undefined;
}

/** How the wait for a redraft is going: as usual, past the usual time, or with no signal. */
export type RedraftWait = 'working' | 'slow' | 'offline';
