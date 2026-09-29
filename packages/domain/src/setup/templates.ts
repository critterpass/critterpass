/**
 * Trip setup copy the server renders: the pushes (the guide's private ask, its answer to whoever
 * asked, the calendar and must-do prompts, lottery reminders) and the realtime hint types on
 * `trip_setup:{trip_id}`. Templates carry a catalog id and the source message; the worker renders
 * them in each recipient's language. No template ever carries a budget number or a calendar event.
 */
export interface SetupCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): SetupCopy => ({ id, message });

export const SETUP_GUIDE_TITLE = copy('notifications.setup.guide.title', '{guide}, for {crew}');

/** The guide's private ask; `{line}` is the guide's own wording with the dates filled in. */
export const ASK_BODY = copy('notifications.setup.ask.body', '{line}');
/** Used when the guide's wording is unavailable (switched off, failed or invalid). */
export const ASK_TEMPLATE_LINE = copy(
  'notifications.setup.ask.template',
  'Quick one, {name}: your {dates} block is marked maybe. Could you free it for {place}?',
);

export const ASK_REPLY_BODY = {
  freed: copy('notifications.setup.ask.freed', '{name} freed {dates}. The week works for all.'),
  not_movable: copy(
    'notifications.setup.ask.not_movable',
    "{name} can't move {dates}. Pick the week that works best.",
  ),
  timed_out: copy(
    'notifications.setup.ask.timed_out',
    'No answer from {name} in two days, so {dates} is back to the best partial week.',
  ),
} as const;

export const CALENDAR_STALE_BODY = {
  missing: copy(
    'notifications.setup.calendar.missing',
    '{name}, mark the days you could do {place}. It takes a minute.',
  ),
  stale: copy(
    'notifications.setup.calendar.stale',
    "{name}, your calendar hasn't synced in over {days} days. Open setup so {place} counts you in.",
  ),
} as const;

export const MUST_DO_PROMPT_BODY = copy(
  'notifications.setup.must_do.prompt',
  "{name}, what's the one thing {place} isn't complete without?",
);

export const LOTTERY_REMINDER_BODY = {
  deadline: copy(
    'notifications.setup.lottery.deadline',
    'Entries for {title} close {date}. Each of you enters on the official site.',
  ),
  result: copy(
    'notifications.setup.lottery.result',
    '{title} results are out {date}. Check the official site to see if you got in.',
  ),
} as const;

/** Realtime hint types on `trip_setup:{trip_id}` (payloads are ids, enums and counts). */
export const SETUP_RT = {
  stepStatus: 'step.status',
  syncCount: 'calendar.sync_count',
  availability: 'availability.updated',
  windows: 'windows.updated',
  askStatus: 'ask.status',
  budgetCount: 'budget.count',
  budgetBand: 'budget.band',
  budgetLocked: 'budget.locked',
  roomsChanged: 'rooms.changed',
  roomsLocked: 'rooms.locked',
  swapRequested: 'room_swap.requested',
  mustDoRow: 'must_do.row',
} as const;
