/**
 * The short line the guide says out loud while it looks something up in a spoken turn ("Let me
 * check the weather."), so a tool round is not a silence. One line per kind of lookup, in the
 * languages the lines are written in; any other language says nothing rather than switch language
 * mid-conversation. Each line is a whole sentence long enough to be spoken as its own piece.
 */
type FillerKind = 'weather' | 'lookup' | 'travel' | 'plan' | 'bookings' | 'money' | 'flight';

const KIND_OF_TOOL: Readonly<Record<string, FillerKind>> = {
  weather: 'weather',
  marine: 'weather',
  crowd_forecast: 'lookup',
  places_search: 'lookup',
  place_details: 'lookup',
  bookable_activity: 'lookup',
  web_search: 'lookup',
  route_eta: 'travel',
  ride_quote: 'travel',
  plan_read: 'plan',
  fit_check: 'plan',
  bookings_read: 'bookings',
  balances_read: 'money',
  cost_quote: 'money',
  fare_calendar: 'money',
  fx: 'money',
  flight_status: 'flight',
};

const LINES: Readonly<Record<string, Readonly<Record<FillerKind | 'other', string>>>> = {
  en: {
    weather: 'Let me check the weather.',
    lookup: 'Let me look that up.',
    travel: 'Let me check how long that takes.',
    plan: 'Let me look at your plan.',
    bookings: 'Let me check your bookings.',
    money: 'Let me check the numbers.',
    flight: 'Let me check that flight.',
    other: 'Give me a moment.',
  },
  vi: {
    weather: 'Để mình xem thời tiết nhé.',
    lookup: 'Để mình tra thử nhé.',
    travel: 'Để mình xem đi mất bao lâu nhé.',
    plan: 'Để mình xem lịch trình nhé.',
    bookings: 'Để mình xem các đặt chỗ nhé.',
    money: 'Để mình xem lại con số nhé.',
    flight: 'Để mình kiểm tra chuyến bay nhé.',
    other: 'Chờ mình một chút nhé.',
  },
};

/** The line for a tool the guide just called, in the reply's language; null when there is none. */
export function fillerLine(tool: string, language: string): string | null {
  const lines = LINES[(language.split('-')[0] ?? language).toLowerCase()];
  if (lines === undefined) return null;
  return lines[KIND_OF_TOOL[tool] ?? 'other'];
}
