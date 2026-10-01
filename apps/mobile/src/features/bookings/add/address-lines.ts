/**
 * How the crew's forward address is laid out (3h-2): at the body size in the mono face, on two
 * lines that each stay whole ("bali-six" and "@in.critterpass.app"), with COPY beside it only
 * when both fit the pill.
 */
import { tokens } from '@cp/design-tokens';

/** The address is set at the body size. */
export const ADDRESS_SIZE = tokens.type.body.base.fontSize ?? tokens.space['14'];
/** One mono character's advance, in ems. */
const MONO_ADVANCE_EM = 0.6;
/** The small COPY / COPIED button and the gap before it. */
const COPY_ROOM = tokens.space['32'] * 3;

/** The crew's part and the "@domain" part. */
export function addressLines(address: string): readonly [string, string] {
  const at = address.lastIndexOf('@');
  return at <= 0 ? [address, ''] : [address.slice(0, at), address.slice(at)];
}

/**
 * Whether COPY fits beside the address: the longer of its two lines (every mono character is one
 * advance wide) plus the button within the pill's inner width.
 */
export function copyFitsBeside(address: string, innerWidth: number): boolean {
  const longest = Math.max(...addressLines(address).map((line) => line.length));
  return longest * ADDRESS_SIZE * MONO_ADVANCE_EM + COPY_ROOM <= innerWidth;
}
