import type { Messages } from '@lingui/core';

import { catalogs } from './en-XA';

/** The pseudo-locale for development and staging builds; production bundles `no-pseudo.ts`. */
export const pseudoCatalogs: Record<string, Record<string, () => Promise<Messages>>> = { "en-XA": catalogs };
