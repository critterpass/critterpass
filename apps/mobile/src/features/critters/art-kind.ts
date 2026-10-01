/**
 * The renderer's kind for a catalogue critter: locals draw from their own `cp-###` id, while the
 * guides draw from their named kind (Tokek is `gecko`, Pon is `tanuki`). Unknown keys pass
 * through, so a critter a newer release adds still renders once the renderer knows it.
 */
import { critters } from '@cp/critter-art';

const KIND_BY_KEY = new Map(critters.map((critter) => [critter.id, critter.kind]));

export function artKind(key: string): string {
  return KIND_BY_KEY.get(key) ?? key;
}
