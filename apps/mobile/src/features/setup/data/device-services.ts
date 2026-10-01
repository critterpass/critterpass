/**
 * The setup screens' device services: api reads with the session attached (10 s timeout, no
 * retry: the screens re-read on the next realtime hint or when the phone is back online), the
 * system browser for calendar OAuth, and the wall clock. Imported by the route layout only, so
 * screens and tests never load the device session.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: headers and wire codes. */
import * as Linking from 'expo-linking';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { ApiRead, SetupServices } from './services';

const READ_TIMEOUT_MS = 10_000;

function errorOf(body: unknown): { readonly code: string; readonly detail?: unknown } {
  const error = (body as { error?: { code?: unknown; detail?: unknown } } | null)?.error;
  return {
    code: typeof error?.code === 'string' ? error.code : 'UNKNOWN',
    ...(error?.detail === undefined ? {} : { detail: error.detail }),
  };
}

async function getJson(path: string): Promise<ApiRead> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
      signal: controller.signal,
    });
    const text = await response.text();
    const body: unknown = text.length > 0 ? JSON.parse(text) : null;
    if (response.ok) return { kind: 'ok', body };
    if (response.status >= 500) return { kind: 'offline' };
    return { kind: 'error', status: response.status, ...errorOf(body) };
  } catch {
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

export const deviceSetupServices: SetupServices = {
  getJson,
  openUrl: async (url) => {
    await Linking.openURL(url);
  },
  apiUrl: (path) => `${resolveApiBaseUrl()}${path}`,
  now: () => Date.now(),
};
