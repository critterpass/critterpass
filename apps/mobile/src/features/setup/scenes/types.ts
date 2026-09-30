/** One fixed setup scene for the developer tools and device screenshots. */
import type { ReactNode } from 'react';

export interface SetupScene {
  /** Screenshot name: the design id first when a render exists (`3c-5-budget`). */
  readonly name: string;
  readonly render: () => ReactNode;
}

/** The developer scene list sets this; a scene's sheet calls it when dismissed (✕, back). */
export const sceneExit: { current: () => void } = { current: () => undefined };

export function exitScene(): void {
  sceneExit.current();
}
