import type { Messages } from '@lingui/core';

/** Production builds: no pseudo-locale (the app's Metro config resolves `./pseudo` here). */
export const pseudoCatalogs: Record<string, Record<string, () => Promise<Messages>>> = {};
