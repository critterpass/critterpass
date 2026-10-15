import { canonicalSeed, critters } from '@cp/critter-art';

export interface DexCell {
  readonly kind: string;
  readonly name: string;
  readonly seed: number;
}

/** The real 150-critter CritterDex (incl. the 6 guide cp-id aliases — see `@cp/critter-art`'s own comment on `critters`), reduced to what `<Sticker>` needs. Route files can't import `@cp/critter-art` directly (`boundaries/dependencies` — only the `ui`/`data`/`domain` layers may), so the sticker lab reads this instead of the raw package. */
export const DEX_CELLS: readonly DexCell[] = critters.map((critter) => ({
  kind: critter.kind,
  name: critter.name,
  seed: canonicalSeed(critter),
}));

/** The dex's first 2 entries, typed as a fixed pair — used for the sticker lab's 2 hero draw-ons. */
export const HERO_CELLS: readonly [DexCell, DexCell] = (() => {
  const [first, second] = DEX_CELLS;
  if (!first || !second) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a programmer-error diagnostic, never shown to a user.
    throw new Error('dex: expected @cp/critter-art to export at least 2 critters');
  }
  return [first, second];
})();
