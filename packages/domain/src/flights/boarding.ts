/**
 * Boarding time for the flight card and the boarding ping (docs/api-contracts-async.md N-41): the
 * airline's announced boarding time when a provider gave one, otherwise the departure (estimated
 * when known, else scheduled) less 40 minutes, labelled "est." on the card. An estimate never
 * drives an ALWAYS push on its own schedule change: only the traveller's own boarding ping.
 */
export const BOARDING_LEAD_MINUTES = 40;

export interface BoardingTime {
  readonly at: Date;
  readonly estimated: boolean;
}

export function boardingTime(input: {
  readonly schedDepAt: Date;
  readonly estDepAt?: Date | null;
  readonly announcedAt?: Date | null;
}): BoardingTime {
  if (input.announcedAt !== undefined && input.announcedAt !== null) {
    return { at: input.announcedAt, estimated: false };
  }
  const departure = input.estDepAt ?? input.schedDepAt;
  return { at: new Date(departure.getTime() - BOARDING_LEAD_MINUTES * 60_000), estimated: true };
}
