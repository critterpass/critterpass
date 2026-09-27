import type { ReactNode } from 'react';

import type { Contrast } from '@/lib/theme';

/** One reviewable state of one component (docs/design-system.md §7 `__states__` fixtures). */
export interface Fixture {
  /** Component name as listed in the gallery, e.g. `Text`, `TabBar`. */
  readonly component: string;
  /** State name, e.g. `default`, `empty`, `offline`, `h1 auto-fit`. */
  readonly state: string;
  readonly render: () => ReactNode;
}

/** Gallery-local preview settings; locale and motion mode use the app's real settings instead. */
export interface GallerySettings {
  readonly fontScale: number;
  readonly contrast: Contrast;
}

/** Font scales the gallery previews: default, large, and the AX3 / Android 200% ceiling. */
export const GALLERY_FONT_SCALES = [1, 1.5, 2] as const;
