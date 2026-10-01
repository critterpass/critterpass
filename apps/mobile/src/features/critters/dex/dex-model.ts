/**
 * The Critterdex (3l-2, 3l-8) as data: counts, the here-now card, a legendary on your dates, the
 * home set and every place set by rank, each critter as a cell. Built from local rows only; a
 * critter's name is known only from the viewer's own verified entry, never from the catalogue.
 */
import type { FormSpec, Palette, Pose, EdgeStyle } from '@cp/critter-art';
import {
  dexCounts,
  dexSections,
  homeSetFor,
  nextWindowSpan,
  windowRuleSchema,
  type Rarity,
  type WindowRule,
} from '@cp/domain';

import {
  parseJson,
  type CritterRow,
  type CrewCountRow,
  type EntryRow,
  type FormRow,
  type MeRow,
  type SetRow,
  type TripRow,
  type WindowRow,
} from '../data/queries';

export type DexFilter = 'all' | 'found' | 'near';

export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface CritterCell {
  readonly id: string;
  readonly key: string;
  readonly no: number;
  readonly setId: string;
  readonly city: string;
  readonly seed: number;
  /** From the viewer's own verified entry; null while unfound or pending. */
  readonly name: string | null;
  readonly found: boolean;
  /** Befriended, waiting for the server to verify it. */
  readonly pending: boolean;
  /** Owned forms, lit as corner dots. */
  readonly lit: readonly Rarity[];
  /** The best owned form, for the sticker. */
  readonly form: FormSpec | null;
  /** Unfound, and only ever met in a legendary window: its silhouette is gold. */
  readonly gold: boolean;
}

export interface SetModel {
  readonly id: string;
  readonly name: string;
  readonly rank: number | null;
  readonly country: string;
  readonly found: number;
  readonly total: number;
  readonly home: boolean;
  readonly cells: readonly CritterCell[];
}

export interface HereNowForm {
  readonly formId: string;
  readonly rarity: Rarity;
  readonly found: boolean;
  readonly requirement: string | null;
  readonly spec: FormSpec | null;
}

export interface HereNowModel {
  readonly set: SetModel;
  readonly place: string;
  readonly critter: CritterCell;
  readonly forms: readonly HereNowForm[];
  /** The next unfound form's requirement ("Batur by sunrise"), where it lives, never its name. */
  readonly nextForm: HereNowForm | null;
}

export interface LegendaryOnDates {
  readonly windowId: string;
  readonly formId: string;
  readonly critterKey: string | null;
  readonly critterSeed: number;
  readonly placeLine: string;
  readonly start: string;
  readonly end: string;
}

export interface DexModel {
  readonly found: number;
  readonly total: number;
  readonly placesFound: number;
  readonly placesTotal: number;
  readonly comparison: { readonly name: string; readonly critters: number } | null;
  readonly hereNow: HereNowModel | null;
  readonly legendary: LegendaryOnDates | null;
  readonly home: SetModel | null;
  readonly places: readonly SetModel[];
}

export interface DexInput {
  readonly sets: readonly SetRow[];
  readonly critters: readonly CritterRow[];
  readonly forms: readonly FormRow[];
  readonly entries: readonly EntryRow[];
  readonly windows: readonly WindowRow[];
  readonly trips: readonly TripRow[];
  readonly me: MeRow | null;
  readonly crewCounts: readonly CrewCountRow[];
}

/** A form row's render spec, or null when its palette is missing or unreadable. */
export function formSpec(form: FormRow): FormSpec | null {
  const palette = parseJson<Palette | null>(form.palette, null);
  if (palette === null || typeof palette !== 'object') return null;
  const edge = (form.edge ?? 'none') as EdgeStyle;
  return form.pose === null
    ? { rarity: form.rarity, palette, edge }
    : { rarity: form.rarity, palette, edge, pose: form.pose as Pose };
}

export function windowRule(row: WindowRow): WindowRule | null {
  const parsed = windowRuleSchema.safeParse(parseJson<unknown>(row.rule, null));
  return parsed.success ? parsed.data : null;
}

function cellsFor(input: DexInput): Map<string, CritterCell> {
  const formsById = new Map(input.forms.map((form) => [form.id, form]));
  const legendaryForms = new Set(input.windows.map((w) => w.form_id));
  const goldCritters = new Set(
    input.forms.filter((f) => legendaryForms.has(f.id)).map((f) => f.critter_id),
  );
  const counts = dexCounts({
    critters: input.critters,
    forms: input.forms,
    entries: input.entries,
  });
  const cells = new Map<string, CritterCell>();
  for (const critter of input.critters) {
    const mine = input.entries.filter((e) => e.critter_id === critter.id);
    const verified = mine.filter((e) => e.verification === 'verified');
    const lit = RARITY_ORDER.filter((r) => counts.dots.get(critter.id)?.has(r) === true);
    const best = [...verified]
      .map((e) => formsById.get(e.form_id))
      .filter((f): f is FormRow => f !== undefined)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))[0];
    const found = verified.length > 0;
    cells.set(critter.id, {
      id: critter.id,
      key: critter.key,
      no: critter.no,
      setId: critter.set_id,
      city: critter.city ?? '',
      seed: critter.canonical_seed ?? critter.no,
      name: verified.find((e) => e.critter_name !== null)?.critter_name ?? null,
      found,
      pending: !found && mine.some((e) => e.verification === 'pending'),
      lit,
      form: best === undefined ? null : formSpec(best),
      gold: !found && goldCritters.has(critter.id),
    });
  }
  return cells;
}

function legendaryOnDates(input: DexInput, cells: Map<string, CritterCell>) {
  const formCritter = new Map(input.forms.map((f) => [f.id, f.critter_id]));
  for (const trip of input.trips) {
    if (trip.start_date === null || trip.end_date === null) continue;
    for (const row of input.windows) {
      const rule = windowRule(row);
      if (rule === null || rule.type === 'any_day') continue;
      const span = nextWindowSpan(rule, trip.start_date);
      if (span === null || span.start > trip.end_date) continue;
      // Only a legendary of the place the trip goes to: a window somewhere else in the world is
      // not "on your dates".
      const critterId = formCritter.get(row.form_id);
      const cell = critterId === undefined ? undefined : cells.get(critterId);
      if (cell === undefined || trip.critter_set_id === null) continue;
      if (cell.setId !== trip.critter_set_id || cell.found) continue;
      return {
        windowId: row.id,
        formId: row.form_id,
        critterKey: cell.key,
        critterSeed: cell.seed,
        placeLine: row.place_line ?? '',
        start: span.start,
        end: span.end,
      };
    }
  }
  return null;
}

export function buildDex(input: DexInput): DexModel {
  const cells = cellsFor(input);
  const homeSet = homeSetFor(input.me?.home_country ?? null, input.sets);
  const hereTrip = input.trips.find((t) => t.status === 'in_trip' && t.critter_set_id !== null);
  const hereSetId = hereTrip?.critter_set_id ?? null;
  const legendary = legendaryOnDates(input, cells);
  const setModel = (set: SetRow): SetModel => {
    const members = [...cells.values()]
      .filter((cell) => cell.setId === set.id)
      .sort((a, b) => a.no - b.no);
    return {
      id: set.id,
      name: set.name,
      rank: set.rank,
      country: set.country,
      found: members.filter((c) => c.found).length,
      total: members.length,
      home: set.id === homeSet?.id,
      cells: members,
    };
  };
  const byId = new Map(input.sets.map((set) => [set.id, set]));
  const sections = dexSections({
    sets: input.sets,
    hereSetId: hereSetId !== null && byId.has(hereSetId) ? hereSetId : null,
    legendaryOnDates: legendary !== null,
    homeSetId: homeSet?.id ?? null,
  });
  let hereNow: HereNowModel | null = null;
  let home: SetModel | null = null;
  const places: SetModel[] = [];
  for (const section of sections) {
    const set = section.set_id === null ? undefined : byId.get(section.set_id);
    if (set === undefined) continue;
    const model = setModel(set);
    if (section.kind === 'here_now' && hereTrip !== undefined) {
      hereNow = hereNowFor(model, set, hereTrip, input);
      if (model.home) home = model;
    } else if (section.kind === 'home') home = model;
    else places.push(model);
  }
  const counts = dexCounts({
    critters: input.critters,
    forms: input.forms,
    entries: input.entries,
  });
  const top = input.crewCounts[0];
  return {
    found: counts.critters.found,
    total: counts.critters.total,
    placesFound: [...counts.perSet.values()].filter((c) => c.found > 0).length,
    placesTotal: input.sets.length,
    comparison:
      top === undefined || top.critters <= 0
        ? null
        : { name: top.display_name ?? '', critters: top.critters },
    hereNow,
    legendary,
    home,
    places,
  };
}

function hereNowFor(model: SetModel, set: SetRow, trip: TripRow, input: DexInput): HereNowModel {
  const hero =
    model.cells.find((c) => c.key === set.hero_critter_key) ??
    model.cells.find((c) => !c.found) ??
    model.cells[0];
  const owned = new Set(
    input.entries.filter((e) => e.verification === 'verified').map((e) => e.form_id),
  );
  const forms: HereNowForm[] = input.forms
    .filter((f) => f.critter_id === hero?.id)
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
    .map((f) => ({
      formId: f.id,
      rarity: f.rarity,
      found: owned.has(f.id),
      requirement: f.requirement_copy,
      spec: formSpec(f),
    }));
  return {
    set: model,
    place: trip.destination_name ?? set.name,
    critter: hero ?? emptyCell(set.id),
    forms,
    nextForm: forms.find((f) => !f.found) ?? null,
  };
}

function emptyCell(setId: string): CritterCell {
  return {
    id: '',
    key: '',
    no: 0,
    setId,
    city: '',
    seed: 0,
    name: null,
    found: false,
    pending: false,
    lit: [],
    form: null,
    gold: false,
  };
}

/** The sets and cells a filter and a place search leave (sets with nothing left drop out). */
export function filterSets(
  sets: readonly SetModel[],
  filter: DexFilter,
  near: ReadonlySet<string>,
  query: string,
): SetModel[] {
  const q = query.trim().toLocaleLowerCase();
  return sets
    .map((set) => {
      const placeHit = q === '' || set.name.toLocaleLowerCase().includes(q);
      const cells = set.cells.filter(
        (cell) =>
          (filter === 'all' ||
            (filter === 'found' && (cell.found || cell.pending)) ||
            (filter === 'near' && near.has(cell.id))) &&
          (placeHit || cell.city.toLocaleLowerCase().includes(q)),
      );
      return { ...set, cells };
    })
    .filter((set) => set.cells.length > 0);
}
