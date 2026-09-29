/** One fixed drafting scene for the developer tools and device screenshots. */
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

export interface DraftScene {
  /** Screenshot name: the design id first when a render exists (`3c-9-draft`). */
  readonly name: string;
  readonly render: () => ReactNode;
}

/** The developer scene list sets this; a scene's sheet calls it when dismissed (✕, back). */
export const sceneExit: { current: () => void } = { current: () => undefined };

export function exitScene(): void {
  sceneExit.current();
}

/** Renders a scene with the app's active language, so Vietnamese captures format dates too. */
export function InLocale({ render }: { readonly render: (locale: string) => ReactNode }) {
  return render(useLocale());
}
