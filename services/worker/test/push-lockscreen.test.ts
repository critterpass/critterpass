/**
 * The lock-screen wording for someone who hides details: every template that carries a money
 * amount, or names where to be, has a sibling that reads as a whole sentence without it, fills from
 * the same values, and renders with no amount or place left in it.
 */
import { readFileSync } from 'node:fs';

import { MONEY_PUSH_BODY, TRIP_DAY_PUSH } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createCopyRenderer } from '../src/push';
import { LOCKSCREEN_REDACTED_IDS, lockscreenCopy } from '../src/push/lockscreen-copy';

/** Every notification template's source message, by id, as extracted into the English catalog. */
function catalog(): Map<string, string> {
  const po = readFileSync(
    new URL('../../../packages/i18n/locales/en/notifications/common.po', import.meta.url),
    'utf8',
  );
  const out = new Map<string, string>();
  for (const match of po.matchAll(/^msgid "([^"]+)"\nmsgstr "((?:[^"\\]|\\.)*)"/gmu)) {
    out.set(match[1] ?? '', match[2] ?? '');
  }
  return out;
}

const placeholders = (message: string) =>
  new Set([...message.matchAll(/\{(\w+)/gu)].map((match) => match[1]));

/** Values that say how much or exactly where (free text a guide or the plan wrote included). */
const DETAIL = ['amount', 'share', 'what', 'place', 'route', 'line', 'headline', 'detail', 'title'];

/** Templates whose `{place}` is where to be, not the trip's destination. */
const WHERE_TO_BE =
  /^notifications\.(trip_day\.(alarm|knock)|la\.(leave_by|meet_up)|meetup_changed|crew_ping|disruption\.late)/u;

describe('lock-screen copy', () => {
  const messages = catalog();

  it('has a sibling for every template with an amount or a place to be', () => {
    const missing = [...messages]
      .filter(
        ([id, message]) =>
          placeholders(message).has('amount') ||
          placeholders(message).has('share') ||
          (WHERE_TO_BE.test(id) && placeholders(message).has('place')),
      )
      .map(([id]) => id)
      .filter((id) => !LOCKSCREEN_REDACTED_IDS.has(id));
    expect(missing).toEqual([]);
  });

  it('words each sibling without details, from values the original already has', () => {
    for (const id of LOCKSCREEN_REDACTED_IDS) {
      const original = messages.get(id);
      expect(original, id).toBeDefined();
      const sibling = lockscreenCopy({ id, message: original ?? '' }, true);
      expect(sibling.id).not.toBe(id);
      const used = placeholders(sibling.message);
      for (const name of used)
        expect(placeholders(original ?? ''), `${id}: ${name}`).toContain(name);
      for (const name of DETAIL) expect(used.has(name), `${id}: ${name}`).toBe(false);
    }
  });

  it('renders a request and an alarm without the amount or the place', async () => {
    const renderer = createCopyRenderer();
    const vars = { payee: 'Rin', amount: '1.200.000 ₫', time: '03:10', place: 'Mount Batur' };
    const body = await renderer.render('en', lockscreenCopy(MONEY_PUSH_BODY.requested, true), vars);
    const title = await renderer.render('en', lockscreenCopy(TRIP_DAY_PUSH.alarmTitle, true), vars);
    expect(body).toBe('Rin asked you to settle up.');
    expect(title).toBe('Leave by 03:10');
    expect(lockscreenCopy(MONEY_PUSH_BODY.requested, false)).toBe(MONEY_PUSH_BODY.requested);
  });
});
