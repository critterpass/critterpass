import { t } from '@lingui/core/macro';
import type { GuideId } from '@/lib/navigation/active-guide';
import type { SetupMember } from '../data/setup-trip';
import type { ShellFrame } from '../shell/frame';
import type { HeatMonth, WhenMode, WindowOption } from './model';
import { type OwnCalendar } from './own-calendar';
import { type DayRange, type RangePick } from './range';

export interface WhenModel {
  readonly isOrganiser: boolean;
  readonly mode: WhenMode;
  /** The step's rows have not been read yet: nothing is known about days or options. */
  readonly loading?: boolean | undefined;
  /** The trip's locked dates, once decided. */
  readonly locked?: DayRange | null | undefined;
  /** The organiser may still change locked dates (setup is open). */
  readonly canChange?: boolean | undefined;
  readonly place: string;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly score: { readonly won: number; readonly next: number } | null;
  readonly members: readonly SetupMember[];
  readonly total: number;
  /** A trip for one (solo, or a crew of one so far): the step speaks to you, not the crew. */
  readonly solo: boolean;
  readonly synced: number;
  /** Names of people who have not shared a day, when the api could say (online). */
  readonly unsyncedNames: readonly string[];
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly best: WindowOption | null;
  readonly options: readonly WindowOption[];
  readonly selectedId: string | null;
  readonly mustDoTitles: ReadonlyMap<string, string>;
  readonly calendar: OwnCalendar;
  readonly now: Date;
  /** Today on this phone (`YYYY-MM-DD`), for the calendar's "Today" link. */
  readonly today?: string | undefined;
  /** A lock or ask in flight, and the last one's failure line. */
  readonly busy: boolean;
  readonly failure: WhenFailure | null;
}

/** Why the last lock or ask failed: no signal, too many tries, or anything else. */
export type WhenFailure = 'offline' | 'rate' | 'generic';

export function failureLine(failure: WhenFailure): string {
  switch (failure) {
    case 'offline':
      return t({
        id: 'setup.when.fail.offline',
        message: 'Locking needs signal. Try again in a moment.',
      });
    case 'rate':
      return t({ id: 'setup.when.fail.rate', message: 'Too many tries. Give it a few minutes.' });
    case 'generic':
      return t({ id: 'setup.when.fail.generic', message: 'That didn’t go through. Try again.' });
  }
}

export interface WhenActions {
  readonly onSelect: (id: string) => void;
  readonly onLock: (start: string, end: string) => void;
  readonly onAsk: (option: WindowOption) => void;
  readonly onPickWeek: () => void;
  readonly onConnect: () => void;
  readonly onMarkByHand: () => void;
}

export interface WhenViewProps {
  readonly shell: ShellFrame;
  readonly model: WhenModel;
  readonly actions: WhenActions;
}

export interface WeekPickerProps {
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly total: number;
  /** The trip's planned length: the ghost's and the chips' length. */
  readonly lengthDays: number;
  /** Today (`YYYY-MM-DD`): nothing earlier can be picked. */
  readonly today?: string | undefined;
  readonly busy: boolean;
  /** Why the last lock did not go through, said on the sheet itself (the step is behind it). */
  readonly failure?: string | null;
  readonly onLock: (start: string, end: string) => void;
  readonly onDismiss: () => void;
  /** Opens on this pick (the lab's scenes). */
  readonly initialPick?: RangePick | undefined;
}
