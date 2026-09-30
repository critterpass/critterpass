/**
 * STILL WORKS lines from what is on the phone: the synced plan (always), then the saved day's
 * files in the bundle's own words ("Trail map, downloaded at 03:02", "Phrase cards", "Hot spring
 * tickets for 09:30"), and what the day could not save and why.
 */
/* eslint-disable lingui/no-unlocalized-strings -- list keys and kinds, never copy. */
import { t } from '@lingui/core/macro';

import type { SavedDay } from '../bundle/bundle-manager';
import type { DayItemRow } from '../hub/data/queries';
import { clockIn } from '../leave-by/model';
import type { StillWorksLine } from './still-works-list';

export function stillWorksLines(input: {
  readonly day: SavedDay | null;
  readonly first: DayItemRow | undefined;
  readonly tz: string;
  readonly locale: string;
}): StillWorksLine[] {
  const { day, first, tz, locale } = input;
  const lines: StillWorksLine[] = [];
  if (first?.starts_at != null) {
    const time = clockIn(new Date(first.starts_at), first.tz ?? tz, locale);
    const title = first.poi_name ?? first.notes ?? '';
    lines.push({
      key: 'plan',
      text:
        title === ''
          ? t({ id: 'trip.offline.plan', message: "Today's plan" })
          : t({ id: 'trip.offline.planFirst', message: `Today's plan and the ${time} ${title}` }),
    });
  } else {
    lines.push({ key: 'plan', text: t({ id: 'trip.offline.plan', message: "Today's plan" }) });
  }
  if (day === null) return lines;
  for (const asset of day.assets) {
    const at = clockIn(new Date(asset.savedAt), tz, locale);
    const label = asset.label;
    lines.push({
      key: asset.key,
      text:
        asset.kind === 'map_region'
          ? t({ id: 'trip.offline.mapAt', message: `${label}, downloaded at ${at}` })
          : label,
    });
  }
  for (const [index, missing] of day.missing.entries()) {
    const label = missing.label;
    lines.push({
      key: `missing-${String(index)}`,
      missing: true,
      text:
        missing.reason === 'space'
          ? t({ id: 'trip.offline.noSpace', message: `${label}: not saved, the phone is full` })
          : t({ id: 'trip.offline.notSavedYet', message: `${label}: needs signal to save` }),
    });
  }
  return lines;
}
