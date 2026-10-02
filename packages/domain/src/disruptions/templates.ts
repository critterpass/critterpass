/**
 * Disruption copy the server renders into pushes (catalog id + source message; the worker renders
 * it in each recipient's language). The flight and watch pushes carry the guide's own line; the
 * running-late push is built from names, minutes and the place: the late ones are told they can
 * choose what to do, whoever waits for them is told who is late and by how much.
 */
export interface DisruptionCopy {
  readonly id: string;
  readonly message: string;
}

export const DISRUPTION_PUSH = {
  needsYesTitle: /*i18n*/ {
    id: 'notifications.disruption.needs_yes_title',
    message: '{headline}',
  },
  needsYesBody: /*i18n*/ { id: 'notifications.disruption.needs_yes_body', message: '{line}' },
  doneTitle: /*i18n*/ { id: 'notifications.disruption.done_title', message: '{headline}' },
  doneBody: /*i18n*/ { id: 'notifications.disruption.done_body', message: '{detail}' },
  watchTitle: /*i18n*/ { id: 'notifications.disruption.watch_title', message: '{title}' },
  watchBody: /*i18n*/ { id: 'notifications.disruption.watch_body', message: '{detail}' },
  lateTitle: /*i18n*/ {
    id: 'notifications.disruption.late_title',
    message: '{place} · +{minutes} min',
  },
  lateBodyYou: /*i18n*/ {
    id: 'notifications.disruption.late_body_you',
    message: 'You are running {minutes} min late. Tap for what you can do.',
  },
  lateBodyWaiting: /*i18n*/ {
    id: 'notifications.disruption.late_body_waiting',
    message:
      '{count, plural, one {{names} is running {minutes} min late.} other {{names} are running {minutes} min late.}}',
  },
} as const satisfies Record<string, DisruptionCopy>;
