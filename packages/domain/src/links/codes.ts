/**
 * Six-character join codes (docs/data-model.md §3.2): typed by people off a screen or read aloud,
 * so the alphabet is Crockford base32 minus every glyph that can be confused with another
 * (0/O, 1/I/L, and U, which Crockford already drops). Generated with a CSPRNG and rejection
 * sampling so every glyph is equally likely.
 */

export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const JOIN_CODE_LENGTH = 6;

const ALPHABET_SIZE = JOIN_CODE_ALPHABET.length;
/** Largest multiple of the alphabet size that fits in a byte; bytes at or above it are redrawn. */
const REJECTION_LIMIT = Math.floor(256 / ALPHABET_SIZE) * ALPHABET_SIZE;
const JOIN_CODE_PATTERN = new RegExp(`^[${JOIN_CODE_ALPHABET}]{${JOIN_CODE_LENGTH}}$`);

export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

const cryptoRandom: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

export function generateJoinCode(random: RandomBytes = cryptoRandom): string {
  let code = '';
  while (code.length < JOIN_CODE_LENGTH) {
    const bytes = random(new Uint8Array(JOIN_CODE_LENGTH * 2));
    for (const byte of bytes) {
      if (byte >= REJECTION_LIMIT) continue;
      code += JOIN_CODE_ALPHABET[byte % ALPHABET_SIZE];
      if (code.length === JOIN_CODE_LENGTH) break;
    }
  }
  return code;
}

/** True for a canonical code (upper case, no separators, alphabet only). */
export function isJoinCode(value: string): boolean {
  return JOIN_CODE_PATTERN.test(value);
}

/**
 * Canonical form of what a person typed or pasted: upper-cased, spaces and dashes dropped.
 * Returns null when anything outside the alphabet remains; a look-alike glyph (O, 0, I, 1, L, U)
 * is rejected rather than guessed, since guessing would let one typo match someone else's code.
 */
export function normalizeJoinCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  return isJoinCode(compact) ? compact : null;
}
