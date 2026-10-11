/** Add to plan's props and the pieces a look of it draws (the current look and the premium one). */
import type { ComponentType } from 'react';

import type { AddBlockProps } from './add-block';
import type { AddSheetViewProps } from './add-sheet-view';
import type { RoutePreset } from './routes';
import type { WhoGoingProps } from './who-going';

export interface AddSheetProps {
  readonly tripId: string;
  /** A place id, or a dropped pin's idea id. */
  readonly placeId: string;
  readonly preset: RoutePreset;
  /** "+ right after this stop": the stop's stable id. */
  readonly afterStableId?: string | undefined;
  /** How the sheet is drawn; the logic is the same in every look. @default the current look */
  readonly look?: AddSheetLook | undefined;
}

/** The pieces a look of Add to plan draws: the sheet, the block in its day, who's going. */
export interface AddSheetLook {
  readonly View: ComponentType<AddSheetViewProps>;
  readonly Block: ComponentType<AddBlockProps>;
  readonly Who: ComponentType<WhoGoingProps>;
}
