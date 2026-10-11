/**
 * A dex cell's art: a found critter as its sticker, a locked one as its silhouette (gold for a
 * legendary). The here-now card's forms, the home set's grid and a country row's cells use it.
 */
import { CritterSticker } from '@/ui/premium';

import { artKind } from '../../art-kind';
import type { CritterCell } from '../../dex/dex-model';
import { CritterSilhouette } from '../components/critter-silhouette';

export function CellArt({
  cell,
  size,
  maskSize,
}: {
  readonly cell: CritterCell;
  readonly size: number;
  /** Silhouettes sit a little smaller than stickers in the design's grids. */
  readonly maskSize?: number;
}) {
  const kind = artKind(cell.key);
  const name = cell.name ?? cell.city;
  if (cell.found || cell.pending) {
    return (
      <CritterSticker
        kind={kind}
        name={name}
        size={size}
        seed={cell.seed}
        {...(cell.form === null ? {} : { form: cell.form })}
      />
    );
  }
  return (
    <CritterSilhouette
      kind={kind}
      label={cell.city}
      size={maskSize ?? size}
      seed={cell.seed}
      rarity={cell.gold ? 'legendary' : 'common'}
      mark={false}
    />
  );
}
