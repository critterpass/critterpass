/**
 * Disruption copy the server renders into pushes, chat and briefing lines (catalog id + source
 * message; the worker renders it in each recipient's language).
 */
export interface DisruptionCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): DisruptionCopy => ({ id, message });

export const DISRUPTION_PUSH = {
  needsYesTitle: copy('notifications.disruption.needs_yes_title', '{headline}'),
  needsYesBody: copy('notifications.disruption.needs_yes_body', '{line}'),
  doneTitle: copy('notifications.disruption.done_title', '{headline}'),
  doneBody: copy('notifications.disruption.done_body', '{detail}'),
  watchTitle: copy('notifications.disruption.watch_title', '{title}'),
  watchBody: copy('notifications.disruption.watch_body', '{detail}'),
  lateTitle: copy('notifications.disruption.late_title', '{title} · +{minutes} min'),
  lateBody: copy('notifications.disruption.late_body', '{detail}'),
} as const;

export const DISRUPTION_LINES = {
  unaffected: copy(
    'disruptions.line.unaffected',
    '{flight} is late for the others. Nothing changes for you.',
  ),
  waitingCrew: copy(
    'disruptions.line.waiting_crew',
    '{names} {verb} {minutes} min late. Start without them.',
  ),
} as const;
