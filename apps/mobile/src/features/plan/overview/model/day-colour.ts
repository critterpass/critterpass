/** Each day's colour across the plan screens: yellow, pink, blue, orange, green, paper, again. */
import { tokens } from '@cp/design-tokens';

const TILE_COLOURS = [
  tokens.color.yellow,
  tokens.color.pink,
  tokens.color.blue,
  tokens.color.orange,
  tokens.color.green.base,
  tokens.color.paper.base,
];

export function dayTileColour(dayNo: number): string {
  return TILE_COLOURS[(dayNo - 1) % TILE_COLOURS.length] ?? tokens.color.yellow;
}
