import type { GuideStickerId } from '@/ui/avatar/guides';

export interface InAppAlarmProps {
  readonly guide: GuideStickerId;
  /** "Leave-by alarm · Batur". */
  readonly eyebrow: string;
  readonly time: string;
  readonly subtitle: string;
  readonly guideLine: string;
  /** The one snooze is still there; false after it (the crew was pinged instead). */
  readonly snoozeAllowed: boolean;
  readonly onUp: () => void;
  readonly onSnooze: () => void;
  readonly onClose?: () => void;
}

export type AlarmSheetKind = 'ask' | 'exact' | 'denied' | 'notification';
