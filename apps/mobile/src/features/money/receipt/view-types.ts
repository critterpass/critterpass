import type { KeypadKey } from '../add-expense/draft';
import type { TypedLine } from './type-lines-model';
import type { MoneyMember } from '../data/context';
import type { ReaderQualityIssue } from '../data/services';
import type { SweepLine } from './ScanSweep';
import type { ReactNode } from 'react';

export type ScanScene =
  | { readonly kind: 'aim' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'reading'; readonly waiting: boolean; readonly slow?: boolean }
  | { readonly kind: 'offline' }
  | { readonly kind: 'upload_failed' }
  | { readonly kind: 'pick_failed' }
  /** The server could not read it: the manual paths, said plainly. */
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'review'; readonly review: LineAssignSheetProps }
  | { readonly kind: 'failure'; readonly failure: FailureSheetProps };

export interface ScanViewProps {
  readonly scene: ScanScene;
  readonly autoSplit: boolean;
  readonly photo: ReactNode | null;
  readonly lines: readonly SweepLine[];
  readonly onAutoSplit: () => void;
  readonly onClose: () => void;
  readonly onScan: () => void;
  readonly onPick: () => void;
  readonly onType: () => void;
  readonly onRetake: () => void;
  readonly onSettings: () => void;
  /** Draws a scene's panel in another look (the premium review and failure sheets); null keeps this one. */
  readonly panelFor?: ((scene: ScanScene) => ReactNode | null) | undefined;
}

export interface FailureSheetProps {
  readonly issue: ReaderQualityIssue | null;
  /** "Rp 1.080.000". */
  readonly total: string;
  readonly merchant: string | null;
  /** "$11.37". */
  readonly each: string;
  readonly onTypeLines: () => void;
  readonly onRetake: () => void;
  readonly onEven: () => void;
  readonly onBack: () => void;
}

export interface ReviewRow {
  readonly lineId: string;
  readonly label: string;
  /** The amount read, shown when the line is one to check against the paper. */
  readonly check: string | null;
  /** Who had it; null = everyone. Non-item lines are shared by share. */
  readonly assignees: readonly MoneyMember[] | null;
  readonly chip: { readonly text: string; readonly tone: 'pink' | 'plain' };
  readonly byShare: boolean;
}

export interface LineAssignSheetProps {
  readonly rows: readonly ReviewRow[];
  readonly members: readonly MoneyMember[];
  /** "Jordan pays $1.50", "Everyone else $13.34". */
  readonly summary: readonly { readonly who: string; readonly amount: string }[];
  readonly payerName: string;
  readonly mismatch: { readonly text: string; readonly keep: boolean } | null;
  /** Retype the lines from what was read, offered while the lines miss the total. */
  readonly onFix?: () => void;
  readonly committing: boolean;
  readonly onLine: (lineId: string) => void;
  readonly onKeepTotal: (keep: boolean) => void;
  readonly onPayer: () => void;
  readonly onCommit: () => void;
}

export interface TypeLinesEditorProps {
  readonly lines: readonly TypedLine[];
  readonly currency: string;
  readonly totalMinor: bigint | null;
  readonly focus: string | null;
  readonly whoLabel: (line: TypedLine) => string;
  readonly payerName: string;
  readonly canCommit: boolean;
  readonly committing: boolean;
  readonly onFocus: (lineId: string) => void;
  readonly onLabel: (lineId: string, label: string) => void;
  readonly onKey: (key: KeypadKey) => void;
  readonly onWho: (lineId: string) => void;
  readonly onAddLine: () => void;
  readonly onCommit: () => void;
}
