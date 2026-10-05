/**
 * The words of add from a link (7d-3), from codes only: where the post came from, what the guide
 * actually read (never "watched" unless a video was analysed), how many it is sure of, and why an
 * import stopped.
 */
import type { ImportPlatform } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import type { LinkImportState } from './link-import-model';

export function fromWhere(platform: ImportPlatform | null): string {
  switch (platform) {
    case 'tiktok':
      return t({ id: 'search.link.from.tiktok', message: 'From a TikTok' });
    case 'youtube':
      return t({ id: 'search.link.from.youtube', message: 'From a YouTube video' });
    case 'instagram':
      return t({ id: 'search.link.from.instagram', message: 'From an Instagram post' });
    case 'google_maps':
      return t({ id: 'search.link.from.googleMaps', message: 'From Google Maps' });
    case 'apple_maps':
      return t({ id: 'search.link.from.appleMaps', message: 'From Apple Maps' });
    case 'screenshot':
      return t({ id: 'search.link.from.screenshot', message: 'From a screenshot' });
    case 'web':
    case null:
      return t({ id: 'search.link.from.link', message: 'From a link' });
  }
}

function readWords(read: 'post_text' | 'video' | 'map_link' | 'ocr_text' | undefined): string {
  switch (read) {
    case 'video':
      return t({ id: 'search.link.read.video', message: 'I watched it.' });
    case 'map_link':
      return t({ id: 'search.link.read.map', message: 'I read the map link.' });
    case 'ocr_text':
      return t({ id: 'search.link.read.screenshot', message: 'I read your screenshot.' });
    case 'post_text':
    case undefined:
      return t({ id: 'search.link.read.post', message: 'I read the post.' });
  }
}

/** The guide's line under the post: what it read, then how sure it is. */
export function guideReadLine(state: LinkImportState): string {
  if (state.status === 'reading' && state.matches.length === 0) {
    return t({ id: 'search.link.reading', message: 'Reading it…' });
  }
  const sure = state.matches.filter((match) => match.kind === 'sure').length;
  const asks = state.matches.filter((match) => match.kind === 'ambiguous').length;
  const read = readWords(state.source?.read);
  if (sure > 0 && asks > 0) {
    return t({
      id: 'search.link.sureAndAsk',
      message: `${read} ${plural(sure, { one: 'One I’m sure of', other: '# I’m sure of' })}, ${plural(asks, { one: 'one I need you for.', other: '# I need you for.' })}`,
    });
  }
  if (sure > 0) {
    return t({
      id: 'search.link.sure',
      message: `${read} ${plural(sure, { one: 'One I’m sure of.', other: '# I’m sure of.' })}`,
    });
  }
  if (asks > 0) {
    return t({
      id: 'search.link.ask',
      message: `${read} ${plural(asks, { one: 'One I need you for.', other: '# I need you for.' })}`,
    });
  }
  return state.status === 'reading'
    ? read
    : t({ id: 'search.link.nothing', message: `${read} I couldn’t pin any place from it.` });
}

/** Why the import stopped, and whether a retry can help. */
export function stopLine(error: LinkImportState['error']): { text: string; retry: boolean } | null {
  switch (error) {
    case null:
      return null;
    case 'unsupported_link':
      return {
        text: t({
          id: 'search.link.error.unsupported',
          message: 'I can’t read this link. Send a screenshot of the post instead.',
        }),
        retry: false,
      };
    case 'unreadable':
    case 'not_found':
      return {
        text: t({ id: 'search.link.error.private', message: 'This post is private or gone.' }),
        retry: false,
      };
    case 'rate_limited':
      return {
        text: t({
          id: 'search.link.error.limit',
          message: 'That’s a lot of links today. Try again tomorrow.',
        }),
        retry: false,
      };
    case 'busy':
    case 'unreachable':
      return {
        text: t({ id: 'search.link.error.busy', message: 'Couldn’t read it just now.' }),
        retry: true,
      };
  }
}

/** The guide's tip for the day the chosen places share. */
export function tipLine(weekday: string): string {
  return t({ id: 'search.link.tip', message: `Your ${weekday} works for these.` });
}

const NAMES_SHOWN = 2;

/** "Tanah Lot, Tegenungan +1": the first names, then how many more. */
export function namesLine(places: readonly { readonly name: string }[]): string {
  const shown = places.slice(0, NAMES_SHOWN).map((place) => place.name);
  const more = places.length - shown.length;
  const names = shown.join(', ');
  return more > 0 ? `${names} +${String(more)}` : names;
}

export interface EndWords {
  readonly title: string;
  readonly subtitle?: string;
}

/** What "Or put them on Sat 17" did: what went on the day, and what went to Ideas instead. */
export function dayEndWords(
  end: {
    readonly outcome: 'applied' | 'proposed' | 'none';
    readonly placed: readonly { readonly name: string }[];
    readonly ideas: readonly { readonly name: string }[];
  },
  day: string,
): EndWords {
  const placed = namesLine(end.placed);
  const ideas = namesLine(end.ideas);
  if (end.outcome === 'none') {
    return {
      title: t({ id: 'search.link.end.noRoom', message: `No room on ${day}` }),
      subtitle: t({ id: 'search.link.end.ideasInstead', message: `Saved to Ideas: ${ideas}` }),
    };
  }
  const title =
    end.outcome === 'applied'
      ? t({ id: 'search.link.addedToast', message: `Added to ${day}` })
      : t({ id: 'search.link.proposedToast', message: 'Sent to the crew to approve' });
  return {
    title,
    subtitle:
      end.ideas.length === 0
        ? placed
        : t({
            id: 'search.link.end.placedAndIdeas',
            message: `${placed}. No room for ${ideas}: saved to Ideas.`,
          }),
  };
}

/** "Or put them on Sat 17" did not go through: nothing changed. */
export function dayFailedWords(day: string): EndWords {
  return {
    title: t({ id: 'search.link.end.dayFailed', message: `Couldn’t put them on ${day}` }),
    subtitle: t({
      id: 'search.link.end.dayFailedLine',
      message: 'Nothing changed. Try again, or save them to Ideas.',
    }),
  };
}

/** What SAVE TO IDEAS did: how many were saved, by name, and any that were not. */
export function savedEndWords(
  saved: readonly { readonly name: string }[],
  chosen: readonly { readonly name: string }[],
): EndWords {
  const count = saved.length;
  if (count === 0) {
    return {
      title: t({ id: 'search.link.end.saveFailed', message: 'Couldn’t save them' }),
      subtitle: t({
        id: 'search.link.end.saveFailedLine',
        message: 'Nothing was saved. Try again.',
      }),
    };
  }
  const missed = chosen.filter((place) => !saved.includes(place));
  const names = namesLine(saved);
  const missedNames = namesLine(missed);
  return {
    title: t({ id: 'search.link.savedToast', message: `${count} saved to Ideas` }),
    subtitle:
      missed.length === 0
        ? names
        : t({
            id: 'search.link.end.savedSome',
            message: `${names}. Couldn’t save ${missedNames}.`,
          }),
  };
}
