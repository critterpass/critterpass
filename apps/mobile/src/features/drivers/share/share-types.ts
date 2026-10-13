/** What the driver share sheet shows and does (6i-1), as its wiring hands it to the screen. */
export type DriverShareStatus =
  'idle' | 'creating' | 'needs_signal' | 'confirm_revoke' | 'revoked' | 'copied';

export interface DriverShareDay {
  readonly dayNo: number;
  readonly label: string;
  readonly selected: boolean;
}

export interface DriverShareView {
  readonly driverName: string;
  readonly onDriverName: ((name: string) => void) | null;
  readonly url: string | null;
  readonly days: readonly DriverShareDay[];
  readonly onToggleDay: (dayNo: number) => void;
  readonly expiresLabel: string;
  readonly onCycleExpiry: () => void;
  readonly allowQuote: boolean;
  readonly onAllowQuote: (next: boolean) => void;
  /** "Opened twice · last at 10:14 today"; null before the first open. */
  readonly opened: string | null;
  /** True when the open count shown is the last one known (no signal). */
  readonly stale: boolean;
  readonly status: DriverShareStatus;
  readonly onCreate: () => void;
  readonly onCopy: () => void;
  readonly onWhatsApp: () => void;
  readonly onRevoke: () => void;
}
