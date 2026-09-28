/**
 * Pass numbers: `CP-0427` on the pass, `CP0427` in the MRZ. The digits come from the server's
 * `pass_number_seq`, reserved by `start_pass`; a pass started offline shows the placeholder until
 * the number syncs.
 */
export const PASS_NUMBER_PLACEHOLDER = 'CP-····';

const PASS_NUMBER = /^CP-(\d{4,})$/u;

export function formatPassNumber(seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`bad pass sequence ${seq}`);
  return `CP-${String(seq).padStart(4, '0')}`;
}

export function isPassNumber(value: string): boolean {
  return PASS_NUMBER.test(value);
}

/** `CP0427`, or `CP` alone while the number is still the placeholder. */
export function mrzPassNumber(number: string | null): string {
  const match = number === null ? null : PASS_NUMBER.exec(number);
  return match?.[1] === undefined ? 'CP' : `CP${match[1]}`;
}
