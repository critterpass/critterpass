/**
 * The thing a plain-words question names ("a waterfall without the crowds"). The parse widens it
 * to a kind of place (nature), so the answer could open on a safari park; places named or tagged
 * for the noun she typed come first, in the search's own order, and the rest follow. Names are
 * matched in the languages a destination's places are named in ("air terjun", "thác").
 */
const fold = (text: string) =>
  text.replace(/[đĐ]/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

interface KindNoun {
  /** What she may type. */
  readonly asked: RegExp;
  /** What a place of that kind is called or tagged. */
  readonly named: RegExp;
}

const KIND_NOUNS: readonly KindNoun[] = [
  {
    asked: /\b(waterfalls?|falls|thac|air terjun)\b/u,
    named: /\b(waterfalls?|falls|thac|air terjun|cascada|cascade)\b/u,
  },
  {
    asked: /\b(coffee|cafes?|ca phe|caphe|kopi)\b/u,
    named: /\b(coffee|cafe|ca phe|caphe|kopi|roasters?|roastery|espresso)\b/u,
  },
  { asked: /\b(beach(es)?|bai bien|pantai)\b/u, named: /\b(beach|bai|pantai|playa|praia)\b/u },
  {
    asked: /\b(temples?|pagodas?|shrines?|chua|den|pura)\b/u,
    named: /\b(temple|pagoda|shrine|chua|den|pura|wat|thien vien)\b/u,
  },
  { asked: /\b(markets?|cho|pasar)\b/u, named: /\b(market|cho|pasar|mercado|bazaar)\b/u },
  { asked: /\b(museums?|bao tang|galler(y|ies))\b/u, named: /\b(museum|bao tang|gallery)\b/u },
  {
    asked: /\b(rice (terraces?|fields?)|ruong bac thang)\b/u,
    named: /\b(rice|terraces?|sawah|ruong bac thang)\b/u,
  },
  { asked: /\b(lakes?|ho|danau)\b/u, named: /\b(lake|ho|danau)\b/u },
  {
    asked: /\b(viewpoints?|views?|lookouts?|ngam canh)\b/u,
    named: /\b(view|viewpoint|lookout|hill|peak|doi|dinh)\b/u,
  },
  { asked: /\b(spas?|massages?)\b/u, named: /\b(spa|massage|wellness)\b/u },
  { asked: /\b(bars?|cocktails?|pubs?)\b/u, named: /\b(bar|cocktail|pub|speakeasy|lounge)\b/u },
];

export interface NamedPlace {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly tags: readonly string[];
}

/** Whether a place is named or tagged for a noun in `words`; null when the words name none. */
export function kindNounMatcher(
  words: string | undefined,
): ((place: NamedPlace) => boolean) | null {
  if (words === undefined) return null;
  const asked = fold(words);
  const nouns = KIND_NOUNS.filter((noun) => noun.asked.test(asked));
  if (nouns.length === 0) return null;
  return (place) => {
    const text = fold(
      `${place.name} ${place.nameLocal ?? ''} ${place.tags.join(' ').replace(/_/gu, ' ')}`,
    );
    return nouns.some((noun) => noun.named.test(text));
  };
}

/** `places` with the ones `matches` holds for first; each group keeps its order. */
export function namedFirst<T>(places: readonly T[], matches: (place: T) => boolean): T[] {
  return [...places.filter(matches), ...places.filter((place) => !matches(place))];
}
