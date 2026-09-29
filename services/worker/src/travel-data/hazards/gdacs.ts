/**
 * GDACS volcano events (Global Disaster Alert and Coordination System, run by the European
 * Commission's JRC with UN OCHA and UNOSAT): the worldwide fallback where no observatory publishes
 * a level we read. The public event API needs no key and lists eruptions whose ash advisories
 * (the VAACs) reach GDACS, newest first, each with a green, orange or red alert. An eruption is at
 * least elevated, so green reads as advisory (2), orange as watch (3) and red as warning (4). Each
 * volcano keeps its newest event, and a reading expires seven days after the event's last update
 * so a volcano that drops out stops showing.
 *
 * Terms (GDACS API quick start and terms of use, March 2025): open to automated use; the only
 * request is to acknowledge the source as "Global Disaster Alert and Coordination System, GDACS",
 * which every headline does, alongside the event's report link. GDACS alerts do not replace the
 * national authorities' own, which is why an observatory feed stays primary wherever one exists.
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';

import type { HazardReading } from './refresh';

export const GDACS_VOLCANO_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=VO';
const EXPIRES_AFTER_MS = 7 * 86_400_000;

const LEVELS: Readonly<Record<string, HazardLevel>> = { green: 2, orange: 3, red: 4 };

interface GdacsEvent {
  readonly eventname?: unknown;
  readonly country?: unknown;
  readonly alertlevel?: unknown;
  readonly todate?: unknown;
  readonly url?: { readonly report?: unknown };
}

/** GDACS times carry no zone; they are UTC. */
const utc = (value: unknown) =>
  typeof value === 'string' ? new Date(value.endsWith('Z') ? value : `${value}Z`) : new Date(NaN);

export function parseGdacsVolcanoes(json: string, now: Date): HazardReading[] {
  const features = (JSON.parse(json) as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error('GDACS volcano list had no features');
  const newest = new Map<string, HazardReading>();
  for (const feature of features as { properties?: GdacsEvent }[]) {
    const event = feature.properties;
    if (typeof event?.eventname !== 'string' || typeof event.alertlevel !== 'string') continue;
    const level = LEVELS[event.alertlevel.toLowerCase()];
    const updated = utc(event.todate);
    if (level === undefined || Number.isNaN(updated.getTime())) continue;
    const subject = event.eventname.replace(/\s+/g, ' ').trim();
    const previous = newest.get(subject.toLowerCase())?.issued_at;
    if (previous !== undefined && previous !== null && previous >= updated) continue;
    const alert = event.alertlevel.toLowerCase();
    const where = typeof event.country === 'string' ? ` (${event.country})` : '';
    newest.set(subject.toLowerCase(), {
      source: 'gdacs',
      kind: 'volcano',
      subject,
      level,
      level_label: `${alert.charAt(0).toUpperCase()}${alert.slice(1)} alert`,
      headline: `${subject}${where} eruption: ${alert} alert from the Global Disaster Alert and Coordination System, GDACS`,
      source_url: typeof event.url?.report === 'string' ? event.url.report : GDACS_VOLCANO_URL,
      issued_at: updated,
      expires_at: new Date(updated.getTime() + EXPIRES_AFTER_MS),
    });
  }
  return [...newest.values()].filter(
    (reading) => reading.expires_at !== null && reading.expires_at > now,
  );
}

export async function fetchGdacs(
  http: SupplierHttp,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<HazardReading[]> {
  const response = await http.request({
    supplier: 'gdacs',
    endpoint: 'volcano_events',
    url: GDACS_VOLCANO_URL,
    headers: { Accept: 'application/json' },
    timeoutMs: 30_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return parseGdacsVolcanoes(response.body, now);
}
