/**
 * Icelandic Met Office aviation colour codes: the VONA notifications table lists every change of a
 * volcano's code (newest first) with its time in UTC. A volcano's current code is its newest row;
 * volcanoes that never left green have no row, so they read as unknown rather than green.
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';

import type { HazardReading } from './refresh';

export const IMO_VONA_URL =
  'https://en.vedur.is/earthquakes-and-volcanism/volcanoes/vona-notifications/';

const COLOURS: Readonly<Record<string, HazardLevel>> = { green: 1, yellow: 2, orange: 3, red: 4 };

const ROW =
  /<tr><td>([^<]+)<\/td><td>(\d+)<\/td><td>(\d{4}-\d{2}-\d{2} \d{2}:\d{2})<\/td><td class="vol_hazard_(\w+) vol_hazard_current">([^<]+)<\/td><td[^>]*>[^<]*<\/td><td><a href="(\?nr=\d+)">/g;

export function parseImoVona(html: string): HazardReading[] {
  const latest = new Map<string, HazardReading>();
  for (const match of html.matchAll(ROW)) {
    const [, name, , time, colour, label, link] = match;
    if (name === undefined || time === undefined || colour === undefined || link === undefined) {
      continue;
    }
    const level = COLOURS[colour.toLowerCase()];
    const subject = name.trim();
    if (level === undefined || latest.has(subject)) continue;
    const colourLabel = (label ?? colour).trim();
    const pretty = colourLabel.charAt(0).toUpperCase() + colourLabel.slice(1).toLowerCase();
    latest.set(subject, {
      source: 'imo',
      kind: 'volcano',
      subject,
      level,
      level_label: pretty,
      headline: `${subject}: aviation colour code ${pretty.toLowerCase()}`,
      source_url: `${IMO_VONA_URL}${link}`,
      issued_at: new Date(`${time.replace(' ', 'T')}:00Z`),
      expires_at: null,
    });
  }
  if (latest.size === 0) throw new Error('IMO VONA page had no notices');
  return [...latest.values()];
}

export async function fetchImo(http: SupplierHttp, signal?: AbortSignal): Promise<HazardReading[]> {
  const response = await http.request({
    supplier: 'imo',
    endpoint: 'vona_notifications',
    url: IMO_VONA_URL,
    headers: { Accept: 'text/html' },
    timeoutMs: 30_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return parseImoVona(response.body);
}
