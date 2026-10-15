import type { DriverTag, DriverVerdict } from '@cp/domain';

export interface RateDriverViewProps {
  readonly name: string;
  readonly days: readonly number[];
  readonly detail: string | null;
  readonly verdict: DriverVerdict | null;
  readonly tags: readonly DriverTag[];
  readonly tip: string;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly onBack: () => void;
  readonly onVerdict: (verdict: DriverVerdict) => void;
  readonly onToggleTag: (tag: DriverTag) => void;
  readonly onTip: (tip: string) => void;
  readonly onSave: () => void;
  readonly onInvite: (() => void) | null;
}
