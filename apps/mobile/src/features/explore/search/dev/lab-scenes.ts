/** Every search lab scene by name, in the order the screenshot flows visit them. */
import type { ReactNode } from 'react';

import { LINK_SCENES } from './link-scenes';
import { SEARCH_SCENES } from './search-scenes';

export const SEARCH_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...SEARCH_SCENES,
  ...LINK_SCENES,
};
