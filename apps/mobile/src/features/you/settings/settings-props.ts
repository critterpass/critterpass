import type { ReactNode } from 'react';
import type { SettingsRow } from '@/ui/inputs/SettingsGroup';

export interface SettingsSection {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly SettingsRow[];
}

export interface SettingsViewProps {
  readonly sections: readonly SettingsSection[];
  /** Sections another area draws itself (permissions), placed after APP. */
  readonly children?: ReactNode;
  /** "CRITTERPASS 1.0 (214)" */
  readonly version: string;
  /** "PASS+ · YEARLY ›": the plan the account is on, opening the plan screen. */
  readonly plan?: { readonly label: string; readonly onPress: () => void };
  /** Five taps on Tokek. */
  readonly onTokek?: () => void;
  readonly onBack?: () => void;
}
