/** Narrowing and looking up the dex's sets: the filters, the place search and a critter's set. */
import type { DexFilter, DexModel, SetModel } from './dex-model';

/** The set a critter belongs to, among the sets the dex shows. */
export function setOfCritter(model: DexModel, critterId: string): SetModel | null {
  const sets = [
    ...(model.hereNow === null ? [] : [model.hereNow.set]),
    ...(model.home === null ? [] : [model.home]),
    ...model.places,
  ];
  return sets.find((set) => set.cells.some((cell) => cell.id === critterId)) ?? null;
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
