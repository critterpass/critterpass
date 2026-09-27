/**
 * MAGMA Indonesia (PVMBG) volcano activity levels: the public "tingkat aktivitas" page lists every
 * monitored volcano under its current level, Level IV (Awas) down to Level I (Normal). The page
 * carries no issue time, so the refresh dates a level from when it first saw it.
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';

import type { HazardReading } from './refresh';

export const MAGMA_URL = 'https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas';

const LEVELS: Readonly<Record<string, HazardLevel>> = { IV: 4, III: 3, II: 2, I: 1 };

/** Level headers and volcano rows, in page order. */
const TOKEN =
  /class="tx-inverse[^"]*">Level (IV|III|II|I) \(([A-Za-z]+)\)<\/a>|^\s*([A-Z][^<\n]*?) - ([^<\n]+?) <a href="(https:\/\/magma\.esdm\.go\.id\/v1\/gunung-api\/laporan\/[^"?]+)/gm;

export function parseMagma(html: string): HazardReading[] {
  const readings: HazardReading[] = [];
  let level: { value: HazardLevel; label: string } | undefined;
  for (const match of html.matchAll(TOKEN)) {
    const [, numeral, word, name, region, url] = match;
    if (numeral !== undefined && word !== undefined) {
      const value = LEVELS[numeral];
      level = value === undefined ? undefined : { value, label: `Level ${numeral} (${word})` };
      continue;
    }
    if (level === undefined || name === undefined || region === undefined || url === undefined) {
      continue;
    }
    readings.push({
      source: 'magma',
      kind: 'volcano',
      subject: name.trim(),
      level: level.value,
      level_label: level.label,
      headline: `${name.trim()} (${region.trim()}) is at ${level.label}`,
      source_url: url,
      issued_at: null,
      expires_at: null,
    });
  }
  if (readings.length === 0) throw new Error('MAGMA page had no volcano levels');
  return readings;
}

export async function fetchMagma(
  http: SupplierHttp,
  signal?: AbortSignal,
): Promise<HazardReading[]> {
  const response = await http.request({
    supplier: 'magma',
    endpoint: 'tingkat_aktivitas',
    url: MAGMA_URL,
    headers: { Accept: 'text/html' },
    timeoutMs: 30_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return parseMagma(response.body);
}
