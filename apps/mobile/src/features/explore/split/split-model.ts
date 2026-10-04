/**
 * Crew can't agree (7e-3), from plain values: the stances read from the synced rows, who has not
 * said, the options the api worked out, and what the main button posts. SUGGEST puts the chosen
 * way against leaving the place out; "Put it to a vote" puts the two ways against each other.
 */
import { t } from '@lingui/core/macro';

import type { WireParser } from '@/data/travel-data/client';

export interface SplitOptionView {
  readonly optionId: string;
  readonly kind: 'split_group' | 'alternative' | 'reschedule';
  readonly title: string;
  readonly body: string;
  readonly attendeeIds: readonly string[];
  readonly goingCount: number;
  readonly cost: {
    readonly minor: number;
    readonly currency: string;
    readonly per: 'person' | 'car';
  } | null;
}

export interface StanceLine {
  readonly userId: string;
  readonly stance: 'want' | 'rather_not';
  readonly note: string | null;
}

type Bag = Readonly<Record<string, unknown>>;
const bag = (v: unknown): Bag | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Bag) : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function optionOf(value: unknown): SplitOptionView[] {
  const o = bag(value);
  const kind = str(o?.['kind']);
  const id = str(o?.['option_id']);
  const title = str(o?.['title']);
  const body = str(o?.['body']);
  const going = o?.['going_count'];
  if (!id || !title || body === null || typeof going !== 'number') return [];
  if (kind !== 'split_group' && kind !== 'alternative' && kind !== 'reschedule') return [];
  const cost = bag(o?.['cost']);
  const minor = cost?.['minor'];
  const currency = str(cost?.['currency']);
  const per = cost?.['per'];
  return [
    {
      optionId: id,
      kind,
      title,
      body,
      attendeeIds: Array.isArray(o?.['attendee_ids'])
        ? (o['attendee_ids'] as unknown[]).flatMap((v) => str(v) ?? [])
        : [],
      goingCount: going,
      cost:
        typeof minor === 'number' && currency !== null && (per === 'person' || per === 'car')
          ? { minor, currency, per }
          : null,
    },
  ];
}

/** The options of `GET …/split`; anything this build does not know is left out. */
export const splitOptionsParser: WireParser<readonly SplitOptionView[]> = {
  safeParse(value) {
    const body = bag(value);
    if (body === null || !Array.isArray(body['options'])) return { success: false };
    return { success: true, data: (body['options'] as unknown[]).flatMap(optionOf) };
  },
};

export type DecisionPost =
  | { readonly mode: 'suggest'; readonly optionIds: readonly [string]; readonly label: string }
  | {
      readonly mode: 'vote';
      readonly optionIds: readonly [string, string];
      readonly label: string;
    };

/** SUGGEST THE FIRST/SECOND ONE for the chosen option; null without one. */
export function suggestPost(
  options: readonly SplitOptionView[],
  chosen: number,
): DecisionPost | null {
  const option = options[chosen];
  if (option === undefined) return null;
  return {
    mode: 'suggest',
    optionIds: [option.optionId],
    label:
      chosen === 0
        ? t({ id: 'explore.split.suggestFirst', message: 'Suggest the first one' })
        : t({ id: 'explore.split.suggestSecond', message: 'Suggest the second one' }),
  };
}

/** "Put it to a vote instead": both of the guide's ways; null without two. */
export function votePost(options: readonly SplitOptionView[]): DecisionPost | null {
  const [first, second] = options;
  if (first === undefined || second === undefined) return null;
  return {
    mode: 'vote',
    optionIds: [first.optionId, second.optionId],
    label: t({ id: 'explore.split.vote', message: 'Put it to a vote instead' }),
  };
}

/** "Rin and you haven't said"; null when everyone has. */
export function silentLine(
  silent: readonly string[],
  me: string | null,
  nameOf: (uid: string) => string,
  list: (names: readonly string[]) => string,
): string | null {
  if (silent.length === 0) return null;
  const others = silent.filter((uid) => uid !== me).map(nameOf);
  const youToo = me !== null && silent.includes(me);
  if (others.length === 0) return t({ id: 'explore.split.silentYou', message: "You haven't said" });
  const names = list(youToo ? [...others, t({ id: 'explore.split.you', message: 'you' })] : others);
  return others.length + (youToo ? 1 : 0) === 1
    ? t({ id: 'explore.split.silentOne', message: `${names} hasn't said` })
    : t({ id: 'explore.split.silent', message: `${names} haven't said` });
}
