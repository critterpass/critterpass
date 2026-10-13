import type { AppIconBaseId } from '@cp/domain';
import type { IconChoice, PickerModel } from './picker-model';

export type AppIconProblem = 'failed' | { readonly locked: AppIconBaseId } | null;

export interface AppIconViewProps {
  readonly model: PickerModel;
  /** The icon being switched to; its tile dims and nothing else can be chosen. */
  readonly switching: AppIconBaseId | null;
  readonly problem: AppIconProblem;
  readonly onChoose: (choice: IconChoice) => void;
  readonly onBack?: () => void;
}
