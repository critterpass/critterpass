/**
 * Smithsonian GVP / USGS Weekly Volcanic Activity Report (RSS, weekly on Thursdays): the fallback
 * where no observatory publishes a level we read. A volcano named in the week's report is at least
 * elevated; the report's own category ("New Eruptive Activity", "Continuing Eruptive Activity",
 * "Other Observations") is kept as the label, and each reading expires eight days after the report
 * so a volcano dropped from the report stops showing.
 */
import type { HazardLevel } from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';

import type { HazardReading } from './refresh';

export const GVP_RSS_URL = 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml';
const EXPIRES_AFTER_MS = 8 * 86_400_000;

const ITEM = /<item>([\s\S]*?)<\/item>/g;
const field = (item: string, name: string) =>
  item.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();

function levelFor(category: string): HazardLevel {
  return /eruptive activity/i.test(category) ? 3 : 2;
}

export function parseGvpWeekly(xml: string): HazardReading[] {
  const readings: HazardReading[] = [];
  for (const [, item = ''] of xml.matchAll(ITEM)) {
    const title = field(item, 'title');
    const published = field(item, 'pubDate');
    const match = title?.match(/^(.+?) \(([^)]+)\) - Report for (.+?) - (.+)$/);
    if (title === undefined || published === undefined || match === null || match === undefined) {
      continue;
    }
    const [, name = '', , , category = ''] = match;
    const issued = new Date(published);
    if (Number.isNaN(issued.getTime())) continue;
    readings.push({
      source: 'gvp',
      kind: 'volcano',
      subject: name,
      level: levelFor(category),
      level_label: category,
      headline: title,
      source_url: field(item, 'guid') ?? field(item, 'link') ?? GVP_RSS_URL,
      issued_at: issued,
      expires_at: new Date(issued.getTime() + EXPIRES_AFTER_MS),
    });
  }
  if (readings.length === 0) throw new Error('GVP weekly report had no items');
  return readings;
}

export async function fetchGvp(http: SupplierHttp, signal?: AbortSignal): Promise<HazardReading[]> {
  const response = await http.request({
    supplier: 'gvp',
    endpoint: 'weekly_rss',
    url: GVP_RSS_URL,
    headers: { Accept: 'application/rss+xml, text/xml' },
    timeoutMs: 30_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return parseGvpWeekly(response.body);
}
