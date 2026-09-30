/** `GET /v1/me/private/dietary` from the device, with the session's cookie. */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and headers, never copy. */
import type { PrivateDietaryWire } from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { DietaryServices } from './dietary-data';

export const deviceDietary: DietaryServices = {
  read: async () => {
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/v1/me/private/dietary`, {
        headers: { accept: 'application/json', ...(await sessionHeaders()) },
      });
      if (response.status === 404) return { kind: 'not_set' };
      if (!response.ok) return { kind: 'offline' };
      return { kind: 'ok', value: (await response.json()) as PrivateDietaryWire };
    } catch {
      return { kind: 'offline' };
    }
  },
};
