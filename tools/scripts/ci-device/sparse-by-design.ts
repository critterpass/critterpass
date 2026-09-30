/**
 * Screenshots whose screen is sparse on purpose, so the EMPTY_SCREEN check leaves them alone (the
 * frame and keyboard-band checks still run on them). The checks only see pixels, so the opt-out is
 * this list, keyed by the end of the shot name (`${PREFIX}-bookings-mailbox-done` matches
 * `bookings-mailbox-done`), each with the render or undesigned-state row that makes it sparse. A
 * screen that is sparse because content failed to draw is a bug and never belongs here.
 */
export const SPARSE_BY_DESIGN: ReadonlyMap<string, string> = new Map([
  [
    'bookings-mailbox-done',
    'undesigned-states 3h-2 "Mailbox footnote and sheet": the sign-in return page is a status line and BACK TO BOOKINGS',
  ],
  [
    'money-payment-disputed',
    'undesigned-states 3i-5 "Payment detail (payee), disputed": one payment, its pink note and the actions its state allows',
  ],
  [
    'gallery-rise',
    'developer gallery rise-demo route: a demo of the rise presentation, a heading and one line of help',
  ],
  [
    'join-code-from-crews',
    'render 3a-11 Join with a code: a headline and one code field, shown here with the keyboard hidden',
  ],
]);

export function isSparseByDesign(shot: string): boolean {
  for (const key of SPARSE_BY_DESIGN.keys()) {
    if (shot === key || shot.endsWith(`-${key}`)) return true;
  }
  return false;
}
