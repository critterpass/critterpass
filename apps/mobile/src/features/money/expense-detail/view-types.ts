import type { EditField } from './model';

export interface DetailShare {
  readonly userId: string;
  readonly name: string;
  /** Crew-currency share; 0 = left out. */
  readonly crewMinor: bigint;
}

export interface DetailEdit {
  readonly id: string;
  readonly editorName: string;
  readonly kind: 'edited' | 'deleted';
  readonly fields: readonly EditField[];
  readonly at: string;
}
