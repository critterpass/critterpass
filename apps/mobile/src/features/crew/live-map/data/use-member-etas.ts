/**
 * The panel's rows from the live view: one per bunch or person, others first in map order, then
 * people not on the map (paused, off), then you. Each carries its status line and arrival clock,
 * recounted every minute (the clock rolls when the ETA or the minute changes).
 */
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { clock, etaSpoken, namesList, statusLine } from '../copy';
import type { RowModel } from '../panel/member-row';
import type { LiveView, PersonView } from './view-model';

function rowOf(
  people: readonly PersonView[],
  tz: string | null,
  locale: string,
  now: number,
): RowModel {
  const lead = people[0] as PersonView;
  const eta = lead.eta;
  const names = namesList(
    people.map((person) =>
      person.isMe ? t({ id: 'liveMap.row.you', message: 'You' }) : person.name,
    ),
    locale,
  );
  const status = statusLine(lead, tz, locale, now);
  const hasEta = lead.sharing === 'live' && eta !== null && eta.min !== null;
  return {
    key: people.map((person) => person.uid).join('+'),
    people,
    title: names,
    status,
    clock: hasEta ? clock(now + (eta.min ?? 0) * 60_000, tz, locale) : null,
    estimate: hasEta && eta.estimate,
    spoken: t({
      id: 'liveMap.a11y.row',
      message: `${names}, ${status}, ${etaSpoken(lead.sharing === 'live' ? eta : null)}`,
    }),
  };
}

export function memberRows(
  view: LiveView,
  tz: string | null,
  locale: string,
  now: number,
): RowModel[] {
  const onMap = new Set<string>();
  const rows: RowModel[] = [];
  for (const pin of view.pins) {
    const people = pin.kind === 'single' ? [pin.person] : pin.people;
    for (const person of people) onMap.add(person.uid);
    rows.push(rowOf(people, tz, locale, now));
  }
  for (const person of view.people) {
    if (person.isMe || onMap.has(person.uid)) continue;
    rows.push(rowOf([person], tz, locale, now));
  }
  if (view.me !== null) rows.push(rowOf([view.me], tz, locale, now));
  return rows;
}

export function useMemberEtas(
  view: LiveView,
  tz: string | null,
  locale: string,
  now: number,
): RowModel[] {
  return useMemo(() => memberRows(view, tz, locale, now), [view, tz, locale, now]);
}
