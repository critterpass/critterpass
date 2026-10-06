/**
 * The "ask for me" post (6b-1), built deterministically from the trip: party size, the legs with
 * their dates and hours, seats, language and, only when the traveller adds it, a budget. The
 * wording comes from the locale's template (EN or ID); each value is an editable slot, so changing
 * one rewrites the post around it. We never read or post to groups: the traveller copies it.
 */

export const ASK_SLOTS = ['party', 'seats', 'language', 'budget'] as const;
export type AskSlot = (typeof ASK_SLOTS)[number];

export interface AskLeg {
  /** Already formatted for the post's language ("Wed 14 Oct"). */
  readonly date: string;
  /** "Ubud → Jatiluwih → Ubud". */
  readonly route: string;
  readonly start: string | null;
  readonly end: string | null;
}

export interface AskPostTemplates {
  /** `{area}`, `{party}`, `{legs}`, `{seats}`, `{language}` and `{budget}` placeholders. */
  readonly body: string;
  /** Used for `{budget}` when the traveller added one: `{amount}`. Empty otherwise. */
  readonly budget: string;
  /** One leg: `{date}`, `{route}`, `{start}`, `{end}`. */
  readonly leg: string;
  /** One leg without hours: `{date}`, `{route}`. */
  readonly legNoTime: string;
}

export interface AskPostValues {
  readonly area: string;
  readonly party: string;
  readonly seats: string;
  readonly language: string;
  /** The formatted budget; null = left out (the private budget is never shared unasked). */
  readonly budget: string | null;
  readonly legs: readonly AskLeg[];
}

/** A run of the post: plain text, a highlighted editable slot, or a leg's date. */
export type AskSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'slot'; readonly slot: AskSlot; readonly text: string }
  | { readonly kind: 'date'; readonly text: string };

const fill = (template: string, values: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/gu, (match, key: string) => values[key] ?? match);

function legLine(templates: AskPostTemplates, leg: AskLeg): AskSegment[] {
  const template = leg.start !== null && leg.end !== null ? templates.leg : templates.legNoTime;
  const [before, after] = template.split('{date}') as [string, string | undefined];
  const rest = fill(after ?? '', {
    route: leg.route,
    start: leg.start ?? '',
    end: leg.end ?? '',
  });
  const out: AskSegment[] = [];
  if (before !== '') out.push({ kind: 'text', text: before });
  out.push({ kind: 'date', text: leg.date });
  if (rest !== '') out.push({ kind: 'text', text: rest });
  return out;
}

/** The post as segments; join their text for the clipboard. */
export function buildAskPost(templates: AskPostTemplates, values: AskPostValues): AskSegment[] {
  const segments: AskSegment[] = [];
  const parts = templates.body.split(/(\{\w+\})/u);
  for (const part of parts) {
    const key = /^\{(\w+)\}$/u.exec(part)?.[1];
    if (key === undefined) {
      if (part !== '') segments.push({ kind: 'text', text: part });
      continue;
    }
    if (key === 'legs') {
      values.legs.forEach((leg, index) => {
        if (index > 0) segments.push({ kind: 'text', text: '\n' });
        segments.push(...legLine(templates, leg));
      });
    } else if (key === 'area') {
      segments.push({ kind: 'text', text: values.area });
    } else if (key === 'budget') {
      if (values.budget === null) continue;
      const [before, after] = templates.budget.split('{amount}') as [string, string | undefined];
      if (before !== '') segments.push({ kind: 'text', text: before });
      segments.push({ kind: 'slot', slot: 'budget', text: values.budget });
      if (after !== undefined && after !== '') segments.push({ kind: 'text', text: after });
    } else if ((ASK_SLOTS as readonly string[]).includes(key)) {
      const slot = key as Exclude<AskSlot, 'budget'>;
      segments.push({ kind: 'slot', slot, text: values[slot] });
    } else {
      segments.push({ kind: 'text', text: part });
    }
  }
  return merge(segments);
}

/** Adjacent text runs joined, so the post renders as few pieces as it can. */
function merge(segments: AskSegment[]): AskSegment[] {
  const out: AskSegment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (segment.kind === 'text' && last?.kind === 'text') {
      out[out.length - 1] = { kind: 'text', text: last.text + segment.text };
    } else {
      out.push(segment);
    }
  }
  return out;
}

export const askPostText = (segments: readonly AskSegment[]): string =>
  segments.map((segment) => segment.text).join('');

/** The languages a post is written in: the crew's English, or Indonesian for Indonesian groups. */
export const ASK_POST_LANGUAGES = ['en', 'id'] as const;
export type AskPostLanguage = (typeof ASK_POST_LANGUAGES)[number];

export interface AskPostWording extends AskPostTemplates {
  readonly party: (people: number) => string;
  readonly seats: (seats: number) => string;
  readonly language: string;
  readonly perDay: (amount: string) => string;
}

/**
 * The post's own wording per post language. The post is written for the group it goes to, so its
 * language is the traveller's choice (EN or ID), not the app's.
 */
export const ASK_POST_WORDING: Readonly<Record<AskPostLanguage, AskPostWording>> = {
  en: {
    body: "Hi all, looking for a driver or driver-guide in {area} for {party}.\n\n{legs}\n\nNeed {seats}, {language} please.{budget} Please say what's included (fuel, parking, tolls, entry) and your overtime rate. Thank you!",
    budget: ' Budget around {amount}.',
    leg: '{date}: {route}, {start} to about {end}',
    legNoTime: '{date}: {route}',
    party: (people) => (people === 1 ? '1 adult' : `${people} adults`),
    seats: (seats) => `${seats}+ seats`,
    language: 'English',
    perDay: (amount) => `${amount} a day`,
  },
  id: {
    body: 'Halo semua, cari sopir atau sopir-guide di {area} untuk {party}.\n\n{legs}\n\nPerlu {seats}, bisa {language}.{budget} Mohon info apa saja yang sudah termasuk (bensin, parkir, tol, tiket masuk) dan tarif overtime. Terima kasih!',
    budget: ' Budget sekitar {amount}.',
    leg: '{date}: {route}, {start} sampai sekitar {end}',
    legNoTime: '{date}: {route}',
    party: (people) => `${people} orang dewasa`,
    seats: (seats) => `${seats}+ kursi`,
    language: 'bahasa Inggris',
    perDay: (amount) => `${amount} per hari`,
  },
};
