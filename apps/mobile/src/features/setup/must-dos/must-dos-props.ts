import type { ShellFrame } from '../shell/frame';
import type { ExamplePlace } from './examples';
import type { MustDoItem, MustDosModel } from './model';
import type { ReactNode } from 'react';
import type { SetupMember, SetupTrip } from '../data/setup-trip';
import type { PlaceResult, SearchState } from './search';

export interface MustDosViewProps {
  readonly trip: SetupTrip;
  readonly shell: ShellFrame;
  readonly model: MustDosModel;
  /** The member may add another (under the per-member cap). */
  readonly canAdd: boolean;
  readonly drafting?: boolean;
  /**
   * Where a finished setup leads: the organiser's draft still being written or ready to read, or
   * the trip once its plan has gone out (members too). Null when there is nothing to open (a
   * member before the plan is out).
   */
  readonly draft?: 'writing' | 'ready' | 'planned' | null;
  readonly onOpenDraft?: () => void;
  readonly onAdd: () => void;
  readonly onDraft: () => void;
  /** Drafts with nothing on the list (offered only where the server takes that move). */
  readonly onDraftWithout?: (() => void) | undefined;
  /** Places to tap when the list is empty (the guide's top picks there); each adds itself. */
  readonly examples?: readonly ExamplePlace[];
  readonly onExample?: ((place: ExamplePlace) => void) | undefined;
  readonly onRemove: (item: MustDoItem) => void;
  readonly onRemind: (item: MustDoItem) => void;
}

export interface AddSheetViewProps {
  readonly trip: SetupTrip;
  readonly me: SetupMember;
  readonly query: string;
  readonly search: SearchState;
  readonly onQuery: (text: string) => void;
  readonly onPickPlace: (place: PlaceResult) => void;
  readonly onKeepText: () => void;
  readonly onDismiss?: (() => void) | undefined;
  /** Live results past the guide's own ("More places"), drawn under the list. */
  readonly more?: ReactNode;
}
