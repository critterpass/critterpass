/**
 * The invite ticket's printed facts, shared by the current and the premium ticket: the trip's
 * dates (or "to vote"), the seat the newcomer would take of the cap, the per-person estimate, the
 * place's three-letter mark and who is already in (names of members only; invited people are a
 * count, never a name).
 */
import { plural, t } from '@lingui/core/macro';

import { formatMoney, money } from '@cp/cost-engine';
import { format, upper } from '@cp/i18n';

import type { TicketModel } from './ticket-model';

export function placeCode(place: string | null, locale: string): string {
  if (place === null) return '???';
  return upper(place.replace(/\s+/gu, '').slice(0, 3), locale);
}

export function membersLine(model: TicketModel, locale: string): string {
  const names = model.members.map((m) => m.name);
  const listed = format.list(locale, names);
  const inLine =
    names.length === 0
      ? ''
      : t({
          id: 'onboarding.invite.ticket.membersIn',
          message: plural(names.length, {
            one: `${listed} is in.`,
            other: `${listed} are in.`,
          }),
        });
  if (model.waiting === 0) return inLine;
  const waiting = model.waiting;
  const waitLine = t({
    id: 'onboarding.invite.ticket.waiting',
    message: `${waiting} more invited, not in yet.`,
  });
  return inLine === '' ? waitLine : `${inLine} ${waitLine}`;
}

export interface TicketFacts {
  readonly dates: string;
  readonly seat: string;
  readonly each: string;
  readonly members: string;
}

export function ticketFacts(model: TicketModel, locale: string): TicketFacts {
  const dates =
    model.tripStart === null || model.tripEnd === null
      ? t({ id: 'onboarding.invite.ticket.datesOpen', message: 'Dates to vote' })
      : upper(
          format.dateInterval(locale, new Date(model.tripStart), new Date(model.tripEnd), {
            month: 'short',
            day: 'numeric',
          }),
          locale,
        );
  const seatNumber = model.seat?.number ?? 0;
  const seatCap = model.seat?.cap ?? 0;
  const seat =
    model.seat === null
      ? t({ id: 'onboarding.invite.ticket.seatCrew', message: 'Crew seat' })
      : t({ id: 'onboarding.invite.ticket.seatOf', message: `${seatNumber} of ${seatCap}` });
  const each =
    model.estimate === null
      ? t({ id: 'onboarding.invite.ticket.eachLater', message: 'Worked out together' })
      : `~${formatMoney(money(BigInt(model.estimate.minor), model.estimate.currency), {
          mode: 'local',
          locale,
        })}`;
  return { dates, seat, each, members: membersLine(model, locale) };
}
