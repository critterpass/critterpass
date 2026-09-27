/** One filled shape of a doodle, drawn in order (washes first, then fills and brush strokes). */
export interface DoodleLayer {
  /** SVG path data in the doodle's viewBox units. */
  readonly d: string;
  /**
   * `ink` (the stroke colour the caller picks), `accent` (the optional wash colour) or a
   * `color.*` design-token path for the few fixed colours the prototype draws with.
   */
  readonly paint: string;
  readonly opacity?: number;
  /** Watercolour washes multiply over whatever is beneath them, as in the prototype. */
  readonly multiply?: true;
}

export interface DoodleDef {
  readonly viewBox: readonly [number, number];
  /** Token path the accent washes use when the caller passes no accent (star, flame, sun, …). */
  readonly defaultAccent?: string;
  readonly layers: readonly DoodleLayer[];
}
