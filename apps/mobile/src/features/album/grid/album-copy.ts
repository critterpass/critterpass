/**
 * The album's computed lines: a day section's name ("Day 4 · Batur sunrise", the date when the
 * plan has no such day) and the upload banner ("Uploading 12 photos from today.").
 */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import type { DaySection } from '../data/album-model';

export interface UploadCounts {
  readonly uploading: number;
  readonly waiting: number;
  readonly failed: number;
  readonly skipped: number;
}

export function dayLabel(section: DaySection, locale: string): string {
  if (section.date === null) {
    return t({ id: 'album.day.undated', message: 'No date' });
  }
  const theme = section.theme;
  if (section.dayNo !== null) {
    const day = section.dayNo;
    return theme === null || theme.length === 0
      ? t({ id: 'album.day.number', message: `Day ${day}` })
      : t({ id: 'album.day.themed', message: `Day ${day} · ${theme}` });
  }
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time, never copy.
  return format.date(locale, new Date(`${section.date}T12:00:00`), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** The banner over the grid while this device has photos going up, waiting or failed. */
export function uploadBanner(counts: UploadCounts): { readonly line: string } | null {
  const { uploading, waiting, failed, skipped } = counts;
  if (uploading > 0) {
    return {
      line: t({
        id: 'album.upload.uploading',
        message: plural(uploading, {
          one: 'Uploading # photo.',
          other: 'Uploading # photos.',
        }),
      }),
    };
  }
  if (waiting > 0) {
    return {
      line: t({
        id: 'album.upload.waiting',
        message: plural(waiting, {
          one: '# photo waits for a connection. It goes up on its own.',
          other: '# photos wait for a connection. They go up on their own.',
        }),
      }),
    };
  }
  if (failed > 0) {
    return {
      line: t({
        id: 'album.upload.failed',
        message: plural(failed, {
          one: "# photo didn't upload.",
          other: "# photos didn't upload.",
        }),
      }),
    };
  }
  if (skipped > 0) {
    return {
      line: t({
        id: 'album.upload.skipped',
        message: plural(skipped, {
          one: '# photo was already in the album, so we skipped it.',
          other: '# photos were already in the album, so we skipped them.',
        }),
      }),
    };
  }
  return null;
}
