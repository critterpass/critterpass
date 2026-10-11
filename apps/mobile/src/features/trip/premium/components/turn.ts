/** A rotate transform in degrees, for the tilted stickers, tiles and cards the design leans. */
export function turn(degrees: number): { readonly rotate: string } {
  return { rotate: `${degrees}deg` };
}
