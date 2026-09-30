/**
 * Critterdex counts and the PASS tab's section order, derived from the catalogue and the
 * viewer's own `collection_entries`: the dex counts distinct critters found ("9/150"), forms count
 * separately (four corner dots per critter, lit in their tier colour), a set's bar fills one
 * segment per critter found, and the avatar grid is every owned form. Only verified entries count;
 * a pending one shows as pending and a revoked one is gone.
 */
export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export interface DexSet {
  readonly id: string;
  readonly rank: number | null;
  readonly country: string;
}
export interface DexCritter {
  readonly id: string;
  readonly set_id: string;
  readonly no: number;
}
export interface DexForm {
  readonly id: string;
  readonly critter_id: string;
  readonly rarity: Rarity;
}
export interface DexEntry {
  readonly form_id: string;
  readonly critter_id: string;
  readonly verification: 'pending' | 'verified' | 'revoked';
}

export interface SetCount {
  readonly found: number;
  readonly total: number;
}

export interface DexCounts {
  /** Distinct critters found / every critter in the catalogue. */
  readonly critters: SetCount;
  /** Owned forms (the avatar grid). */
  readonly forms: number;
  readonly perSet: ReadonlyMap<string, SetCount>;
  /** Per critter, which rarities are lit (the corner dots). */
  readonly dots: ReadonlyMap<string, ReadonlySet<Rarity>>;
}

export function dexCounts(input: {
  readonly critters: readonly DexCritter[];
  readonly forms: readonly DexForm[];
  readonly entries: readonly DexEntry[];
}): DexCounts {
  const verified = input.entries.filter((entry) => entry.verification === 'verified');
  const formById = new Map(input.forms.map((form) => [form.id, form]));
  const foundCritters = new Set(verified.map((entry) => entry.critter_id));
  const ownedForms = new Set(verified.map((entry) => entry.form_id));
  const dots = new Map<string, Set<Rarity>>();
  for (const formId of ownedForms) {
    const form = formById.get(formId);
    if (form === undefined) continue;
    const lit = dots.get(form.critter_id) ?? new Set<Rarity>();
    lit.add(form.rarity);
    dots.set(form.critter_id, lit);
  }
  const perSet = new Map<string, { found: number; total: number }>();
  for (const critter of input.critters) {
    const count = perSet.get(critter.set_id) ?? { found: 0, total: 0 };
    count.total += 1;
    if (foundCritters.has(critter.id)) count.found += 1;
    perSet.set(critter.set_id, count);
  }
  const catalogueIds = new Set(input.critters.map((critter) => critter.id));
  return {
    critters: {
      found: [...foundCritters].filter((id) => catalogueIds.has(id)).length,
      total: input.critters.length,
    },
    forms: ownedForms.size,
    perSet,
    dots,
  };
}

export type DexSectionKind = 'here_now' | 'legendary_on_dates' | 'home' | 'place';

export interface DexSection {
  readonly kind: DexSectionKind;
  readonly set_id: string | null;
}

/**
 * PASS tab order (3l-2): the set of the destination you are in, the legendary falling on your
 * dates, the home set, then every other place set by `rank` (unranked last, by country).
 * A set appears once, in its first section.
 */
export function dexSections(input: {
  readonly sets: readonly DexSet[];
  readonly hereSetId: string | null;
  readonly legendaryOnDates: boolean;
  readonly homeSetId: string | null;
}): DexSection[] {
  const sections: DexSection[] = [];
  const used = new Set<string>();
  if (input.hereSetId !== null) {
    sections.push({ kind: 'here_now', set_id: input.hereSetId });
    used.add(input.hereSetId);
  }
  if (input.legendaryOnDates) sections.push({ kind: 'legendary_on_dates', set_id: null });
  if (input.homeSetId !== null && !used.has(input.homeSetId)) {
    sections.push({ kind: 'home', set_id: input.homeSetId });
    used.add(input.homeSetId);
  }
  const rest = input.sets
    .filter((set) => !used.has(set.id))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        if (a.rank === null) return 1;
        if (b.rank === null) return -1;
        return a.rank - b.rank;
      }
      return a.country.localeCompare(b.country);
    });
  for (const set of rest) sections.push({ kind: 'place', set_id: set.id });
  return sections;
}
