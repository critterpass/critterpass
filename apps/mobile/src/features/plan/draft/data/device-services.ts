/**
 * The drafting screens' device services: api reads with the session attached (10 s timeout, no
 * retry: the poll simply asks again on its next beat) and the wall clock. Imported by the route
 * layout only, so screens and scenes never load the device session.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: headers and wire codes. */
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { ApiRead, DraftServices } from './services';

const READ_TIMEOUT_MS = 10_000;

function errorCode(body: unknown): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : 'UNKNOWN';
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
    return { kind: 'error', status: response.status, code: errorCode(body) };
  } catch {
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

export const deviceDraftServices: DraftServices = { getJson, now: () => Date.now() };
