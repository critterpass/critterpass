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
  [
    '3l-4-nothing',
    'undesigned-states 3l-4 "Nothing nearby, a way in": the encounter screen with nothing under way is the guide\'s empty state',
  ],
  [
    '3l-9-empty',
    'undesigned-states 3l-9 "Names, reminders, notifications off, empty": a catalogue with no legendaries shows the month strip and one line',
  ],
  [
    'walk-first-message',
    "render 3g-1 Crew chat: the timeline grows up from the composer, so a new crew's chat with its first message is the day label, one bubble and the composer",
  ],
  [
    'walk-guide-asked',
    'render 3j-1 Guide chat: a thread a moment after its first question is the header, the question and the answer starting to type',
  ],
  [
    '3f-6-friend-out',
    "render 3f-6 Who's in: crew of two with the friend out: two rows and the lock note, honest and complete",
  ],
  [
    '3f-6-after-apply',
    "render 3f-6 Who's in: crew of two with the friend out: two rows and the lock note, honest and complete",
  ],
  [
    'plan-calendar-no-dates',
    'undesigned plan CALENDAR tab before the dates are set: the header, the tabs and one line saying there is no calendar to show yet',
  ],
  [
    '3k-9-on-time',
    'undesigned-states 3k-9 "The map": the map fills the screen behind the sheet; tiles do not load on the CI emulator',
  ],
  [
    '3k-9-waiting-crew',
    'undesigned-states 3k-9 "The map": the map fills the screen behind the sheet; tiles do not load on the CI emulator',
  ],
  [
    'sos-session-map',
    'undesigned-states "SOS session map": the map fills the screen behind the waiting card; tiles do not load on the CI emulator',
  ],
  [
    '3k-9-loading',
    'the standard loading skeleton (ui/states/Skeleton card preset) under the back control while the running-late row syncs',
  ],
  [
    '3e-3-loading',
    'the standard list skeleton (ui/states/Skeleton list preset) under the back control while the change set syncs',
  ],
]);

export function isSparseByDesign(shot: string): boolean {
  for (const key of SPARSE_BY_DESIGN.keys()) {
    if (shot === key || shot.endsWith(`-${key}`)) return true;
  }
  return false;
}
