export interface PickDayRow {
  readonly date: string;
  /** "Wed 14 · Jatiluwih". */
  readonly title: string;
  /** The day's window and hours, or who has the day. */
  readonly line: string;
  readonly taken: boolean;
  readonly on: boolean;
}

export interface PickDaysViewProps {
  readonly name: string;
  readonly days: readonly PickDayRow[];
  readonly onToggle: (date: string) => void;
  readonly tell: {
    readonly value: boolean;
    readonly disabled: boolean;
    readonly onChange: (next: boolean) => void;
  };
  /** The driver's quote the crew votes on, in words; null for a pick on his shortlisted terms. */
  readonly quote?: string | null;
  readonly overtime: string | null;
  readonly error: string | null;
  readonly chosen: number;
  readonly busy: 'set' | 'ask' | null;
  /** Sets him at once; null when his quote has to go to the crew first. */
  readonly onSet: (() => void | Promise<void>) | null;
  /** Puts the pick to the crew as a vote; null on a trip of one. */
  readonly onAsk: (() => void | Promise<void>) | null;
}
