/**
 * Which days a page's text speaks for. A search extract often keeps a page's opening times but cuts
 * its closing days ("Open 9:00-17:00" without the "Closed: Sundays" below it), so a proposal must
 * come from text that names days, says daily or names a closure, and must not open a weekday the
 * text says is closed. Weekday names cover the destinations' languages (English, Japanese,
 * Vietnamese, Indonesian, Spanish, Portuguese, Icelandic).
 */
import { WEEKDAYS, type Weekday } from '@cp/domain';

const DAY_NAMES: Readonly<Record<Weekday, string>> = {
  mo: String.raw`\bmon(?:day)?s?\b|月曜|thứ\s*(?:2|hai)|senin|lunes|segunda|mánudag`,
  tu: String.raw`\btue(?:s(?:day)?)?s?\b|火曜|thứ\s*(?:3|ba)|selasa|martes|terça|þriðjudag`,
  we: String.raw`\bwed(?:nesday)?s?\b|水曜|thứ\s*(?:4|tư)|rabu|miércoles|quarta|miðvikudag`,
  th: String.raw`\bthu(?:r(?:s(?:day)?)?)?s?\b|木曜|thứ\s*(?:5|năm)|kamis|jueves|quinta|fimmtudag`,
  fr: String.raw`\bfri(?:day)?s?\b|金曜|thứ\s*(?:6|sáu)|jumat|viernes|sexta|föstudag`,
  sa: String.raw`\bsat(?:urday)?s?\b|土曜|thứ\s*(?:7|bảy)|sabtu|sábado|laugardag`,
  su: String.raw`\bsun(?:day)?s?\b|日曜|chủ\s*nhật|minggu|domingo|sunnudag`,
};
/**
 * Japanese lists closing days by one character (定休日：水・日・祝) or with 曜日. A lone character
 * counts only between list separators, so a date's 月 or 日 (12月29日) or the 日 of 休館日 is no day.
 */
const KANJI_DAY: Readonly<Record<string, Weekday>> = {
  月: 'mo',
  火: 'tu',
  水: 'we',
  木: 'th',
  金: 'fr',
  土: 'sa',
  日: 'su',
};

const ANY_DAY = new RegExp(Object.values(DAY_NAMES).join('|'), 'iu');
const DAILY =
  /daily|every\s*day|7\s*days|all\s*year|year[-\s]round|no\s+(?:regular\s+)?(?:closing|holidays?|days?\s+off)|毎日|年中無休|無休|hàng\s*ngày|mỗi\s*ngày|setiap\s*hari|todos\s+los\s+días|diariamente|todos\s+os\s+dias|alla\s+daga|daglega/iu;
const CLOSURE =
  /closed|closing\s+days?|定休日?|休館日?|休業日?|休園日?|休城日?|休日|đóng\s*cửa|nghỉ|tutup|cerrado|fechado|lokað/giu;
/** How far after a closure word its days are read. */
const CLOSURE_WINDOW = 32;

/** True when the text says which days its hours apply to. */
export function statesDays(text: string): boolean {
  const flat = text.normalize('NFKC');
  return ANY_DAY.test(flat) || DAILY.test(flat) || new RegExp(CLOSURE.source, 'iu').test(flat);
}

/** Weekdays the text says are closed ("Closed: Sundays", "定休日 水・日"). */
export function closedDays(text: string): Set<Weekday> {
  const flat = text.normalize('NFKC');
  const closed = new Set<Weekday>();
  for (const match of flat.matchAll(CLOSURE)) {
    const start = (match.index ?? 0) + match[0].length;
    const window = flat.slice(start, start + CLOSURE_WINDOW);
    for (const day of WEEKDAYS) {
      if (new RegExp(DAY_NAMES[day], 'iu').test(window)) closed.add(day);
    }
    for (const kanji of window.matchAll(
      /(?<=^|[\s:・、,/(])([月火水木金土日])(?=曜|[・、,/\s)]|祝|$)/gu,
    )) {
      const day = KANJI_DAY[kanji[1] ?? ''];
      if (day !== undefined) closed.add(day);
    }
  }
  return closed;
}
