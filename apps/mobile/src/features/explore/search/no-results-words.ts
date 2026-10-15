import { poiCategorySchema } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { categoryWord } from './chip-words';
import type { WayOut } from './plain-filters';
import type { SearchChip } from '@cp/domain';
import { chipLabel, type ChipWords } from './chip-words';

export function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t({ id: 'search.none.minutes', message: `${m} min` });
  const mm = String(m).padStart(2, '0');
  return m === 0 ? `${String(h)}h` : `${String(h)}h${mm}`;
}

function areasLine(areas: readonly string[]): string {
  return areas.join(t({ id: 'search.none.or', message: ' or ' }));
}

/** The broader word a related way out searches with, in the app's language. */
function relatedWord(way: WayOut): string {
  const term = way.params['term'];
  if (typeof term !== 'string') {
    const category = poiCategorySchema.safeParse(way.params['category']);
    return category.success ? categoryWord(category.data) : '';
  }
  switch (term.toLowerCase()) {
    case 'japanese':
      return t({ id: 'search.none.term.japanese', message: 'Japanese' });
    case 'vietnamese':
      return t({ id: 'search.none.term.vietnamese', message: 'Vietnamese' });
    case 'italian':
      return t({ id: 'search.none.term.italian', message: 'Italian' });
    case 'mexican':
      return t({ id: 'search.none.term.mexican', message: 'Mexican' });
    case 'chinese':
      return t({ id: 'search.none.term.chinese', message: 'Chinese' });
    case 'bar':
      return t({ id: 'search.none.term.bar', message: 'bars' });
    case 'cafe':
      return t({ id: 'search.none.term.cafe', message: 'cafes' });
    default:
      return term;
  }
}

/** The way out's two lines: what it is, and what it gives. */
export function wayOutWords(way: WayOut, guideName: string): { title: string; line: string } {
  const count = way.count;
  if (way.kind === 'widen') {
    const span = hoursAndMinutes(
      typeof way.params['minutes'] === 'number' ? way.params['minutes'] : 0,
    );
    const areas = areasLine(way.areas);
    return {
      title: t({ id: 'search.none.widen', message: `Widen to ${span}` }),
      line:
        areas === ''
          ? t({ id: 'search.none.widenCount', message: `${count} places` })
          : t({ id: 'search.none.widenAreas', message: `${count} places, all in ${areas}` }),
    };
  }
  if (way.kind === 'related') {
    const term = relatedWord(way);
    const area = way.areas[0] ?? '';
    const late = way.openLate ?? 0;
    return {
      title: t({ id: 'search.none.related', message: `Try ${term} instead` }),
      line:
        late > 0
          ? t({
              id: 'search.none.relatedLate',
              message: `${count} places in ${area}, ${late} open late`,
            })
          : t({ id: 'search.none.relatedCount', message: `${count} places in ${area}` }),
    };
  }
  return {
    title: t({ id: 'search.none.pin', message: 'Drop a pin' }),
    line: t({ id: 'search.none.pinLine', message: `Add a place ${guideName} doesn’t know yet` }),
  };
}

export function nearestLine(name: string, area: string | null, away: string): string {
  return area === null
    ? t({ id: 'search.none.nearestPlace', message: `The closest is ${name}, ${away} away.` })
    : t({ id: 'search.none.nearest', message: `The closest is ${name} in ${area}, ${away} away.` });
}

/** The chips a looser search left out, worded as the chip row words them. */
export function droppedWords(
  dropped: readonly string[],
  chips: readonly SearchChip[],
  words: ChipWords,
): string[] {
  const codes = new Set(dropped);
  return chips.filter((chip) => codes.has(chip.code)).map((chip) => chipLabel(chip, words));
}

export function closeLine(labels: readonly string[]): string {
  if (labels.length === 0) {
    return t({
      id: 'search.close.line',
      message: 'Nothing matches all of that. These come closest.',
    });
  }
  const left = labels.map((label) => `“${label}”`).join(', ');
  return t({
    id: 'search.close.lineWithout',
    message: `Nothing matches all of that. These match without ${left}.`,
  });
}
