/**
 * Recorded api answers (../__tests__/fixtures, see its README) served at the network boundary: a reader that
 * answers each path from a file, fails like a dropped connection when told the device is offline,
 * and counts the requests it saw.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ReaderResponse, TravelDataReader } from '../client';

export function recorded(file: string): unknown {
  return JSON.parse(
    readFileSync(path.join(__dirname, '..', '__tests__', 'fixtures', `${file}.json`), 'utf8'),
  );
}

export interface RecordedReader extends TravelDataReader {
  readonly paths: string[];
  online: boolean;
}

/** `routes` maps a path prefix to `[status, fixture file]`. */
export function recordedReader(
  routes: Readonly<Record<string, readonly [number, string]>>,
): RecordedReader {
  const paths: string[] = [];
  const reader: RecordedReader = {
    paths,
    online: true,
    getJson(requested): Promise<ReaderResponse> {
      paths.push(requested);
      if (!reader.online) return Promise.reject(new TypeError('Network request failed'));
      const match = Object.entries(routes).find(([prefix]) => requested.startsWith(prefix));
      if (match === undefined) return Promise.reject(new Error(`unrecorded ${requested}`));
      const [status, file] = match[1];
      return Promise.resolve({ status, body: recorded(file) });
    },
  };
  return reader;
}
