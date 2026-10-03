/**
 * The search screens' device services: api reads and posts with the session attached (10 s
 * timeout), the link import's Server-Sent Events over Expo's streaming `fetch`, and the clipboard
 * (read directly on Android; on iOS only asked whether it holds a URL, so no paste alert shows).
 */
/* eslint-disable lingui/no-unlocalized-strings -- headers, wire values and api paths, never copy. */
import { importEventSchema, type ImportEvent } from '@cp/domain';
import * as Clipboard from 'expo-clipboard';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import type { PlaceApiRead } from '@/data/places/more-places';

import type { SearchServices } from './search-services';

const READ_TIMEOUT_MS = 10_000;

async function request(path: string, init: RequestInit): Promise<PlaceApiRead> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(await sessionHeaders()),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const body: unknown = text.length > 0 ? JSON.parse(text) : null;
    if (response.ok) return { kind: 'ok', body };
    if (response.status >= 500) return { kind: 'offline' };
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { kind: 'error', status: response.status, code: typeof code === 'string' ? code : '' };
  } catch {
    return { kind: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Complete `event:`/`data:` blocks out of `buffer`, and what is left of it. */
export function parseImportFrames(buffer: string): { events: ImportEvent[]; rest: string } {
  const blocks = buffer.split(/\r?\n\r?\n/u);
  const rest = blocks.pop() ?? '';
  const events = blocks.flatMap((block) => {
    let name: string | null = null;
    const data: string[] = [];
    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (name === null || data.length === 0) return [];
    try {
      const raw: unknown = JSON.parse(data.join('\n'));
      const parsed = importEventSchema.safeParse({ event: name, data: raw });
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
  return { events, rest };
}

async function streamImport(
  tripId: string,
  body: unknown,
  onEvent: (event: ImportEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await expoFetch(`${resolveApiBaseUrl()}/v1/trips/${tripId}/imports`, {
    method: 'POST',
    headers: {
      ...(await sessionHeaders()),
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(`import answered ${String(response.status)}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseImportFrames(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
  parseImportFrames(`${buffer}\n\n`).events.forEach(onEvent);
}

export const deviceSearchServices: SearchServices = {
  getJson: (path) => request(path, { method: 'GET' }),
  postJson: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  streamImport: (tripId, body, onEvent, signal) => streamImport(tripId, body, onEvent, signal),
  readClipboard: async () => {
    if (Platform.OS === 'ios') return null;
    try {
      const text = await Clipboard.getStringAsync();
      return text === '' ? null : text;
    } catch {
      return null;
    }
  },
  clipboardHasUrl: async () => {
    try {
      return Platform.OS === 'ios' ? await Clipboard.hasUrlAsync() : false;
    } catch {
      return false;
    }
  },
};
