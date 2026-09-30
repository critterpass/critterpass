/**
 * Critter validators (all blocking): ids stay the design's and never move between places, every
 * place has exactly its set size, native names exist exactly where the place writes in a non-Latin
 * script and use that script, display names are Latin, notes never give the name away, and no name
 * trips the IP screen.
 */
import type { ContentItem } from '@cp/content';
import { critters as dex, places } from '@cp/critter-art';

import { placeFacts, writesInLatin } from '../../data/place-facts';
import { checkName } from '../../ip/check';
import type { Validators } from '../../validators/registry';

type Critter = ContentItem<'critters'>;

const SCRIPT_LETTERS: Readonly<Record<string, RegExp>> = {
  Jpan: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  Hans: /\p{Script=Han}/u,
  Hant: /\p{Script=Han}/u,
  Grek: /\p{Script=Greek}/u,
  Thai: /\p{Script=Thai}/u,
  Arab: /\p{Script=Arabic}/u,
  Kore: /\p{Script=Hangul}/u,
  Deva: /\p{Script=Devanagari}/u,
  Khmr: /\p{Script=Khmer}/u,
  Geor: /\p{Script=Georgian}/u,
  Laoo: /\p{Script=Lao}/u,
};

/** Every letter of `text` belongs to `script`. */
export function inScript(text: string, script: string): boolean {
  const pattern = SCRIPT_LETTERS[script];
  if (pattern === undefined) return false;
  // Script-neutral marks (the Japanese long-vowel mark ー, combining marks) count for any script.
  const letters = [...text].filter(
    (ch) => /\p{L}/u.test(ch) && !/[\p{Script=Common}\p{Script=Inherited}]/u.test(ch),
  );
  return letters.length > 0 && letters.every((ch) => pattern.test(ch));
}

const LATIN_NAME = /^[\p{Script=Latin}\p{M}\s'’.-]+$/u;
const dexById = new Map(dex.map((entry) => [entry.id, entry]));

export const critterValidators: Validators<'critters'> = {
  items: [
    {
      id: 'dex-identity',
      severity: 'fail',
      check: (item: Critter) => {
        const entry = dexById.get(item.id);
        if (entry === undefined) return [`${item.id} is not in the design dex`];
        const problems: string[] = [];
        if (entry.code !== item.set_code)
          problems.push(`${item.id} belongs to ${entry.code}, not ${item.set_code}`);
        if (entry.no !== item.no) problems.push(`${item.id} is dex number ${entry.no}`);
        return problems;
      },
    },
    {
      id: 'romanised-name',
      severity: 'fail',
      check: (item) =>
        LATIN_NAME.test(item.name) ? [] : [`display name "${item.name}" is not in Latin script`],
    },
    {
      id: 'native-script',
      severity: 'fail',
      check: (item) => {
        const facts = placeFacts(item.set_code);
        if (writesInLatin(item.set_code)) {
          return item.name_native === null
            ? []
            : ['a Latin-script place has no separate native name'];
        }
        if (item.name_native === null) return [`${facts.script} place needs a native-script name`];
        return inScript(item.name_native, facts.script)
          ? []
          : [`native name "${item.name_native}" is not written in ${facts.script}`];
      },
    },
    {
      id: 'note-hides-name',
      severity: 'fail',
      check: (item) => {
        const note = item.note.toLowerCase();
        // A name that is the species' own word (Kiwi the kiwi) cannot be hidden by the note.
        const species = item.species.toLowerCase();
        const leaks = [item.name, item.name_native]
          .filter((name): name is string => name !== null && name.length >= 3)
          .filter((name) => !species.includes(name.toLowerCase()))
          .filter((name) =>
            new RegExp(`(^|[^\\p{L}])${name.toLowerCase()}([^\\p{L}]|$)`, 'u').test(note),
          );
        return leaks.length === 0 ? [] : [`note gives away the name (${leaks.join(', ')})`];
      },
    },
    {
      id: 'note-voice',
      severity: 'warn',
      check: (item) =>
        /(^|\s)(I|I'm|my|me)\s|!|\p{Extended_Pictographic}/u.test(item.note)
          ? ['note should read as a neutral narrator (no "I", exclamation marks or emoji)']
          : [],
    },
    {
      id: 'ip-screen',
      severity: 'fail',
      check: (item) => {
        const result = checkName(item.name);
        return result.status === 'clear'
          ? []
          : [`"${item.name}" is close to ${result.matches.map((m) => m.protectedName).join(', ')}`];
      },
    },
  ],
  batch: [
    {
      id: 'set-counts',
      severity: 'fail',
      check: ({ items }) => {
        const byPlace = new Map<string, number>();
        for (const item of items) byPlace.set(item.set_code, (byPlace.get(item.set_code) ?? 0) + 1);
        return [...byPlace].flatMap(([code, count]) => {
          const place = places.find((p) => p.code === code);
          // The place data holds each set's size, which grows as critters roll out.
          const expected = place?.critterIds.length ?? 0;
          return count === expected
            ? []
            : [{ ref: null, message: `${code} has ${count} critters, its set holds ${expected}` }];
        });
      },
    },
    {
      id: 'stable-ids',
      severity: 'fail',
      check: ({ items, previous }) => {
        const now = new Map(items.map((item) => [item.id, item.set_code]));
        return previous.flatMap((old) => {
          const code = now.get(old.id);
          return code === undefined || code === old.set_code
            ? []
            : [{ ref: old.id, message: `${old.id} moved from ${old.set_code} to ${code}` }];
        });
      },
    },
  ],
};
