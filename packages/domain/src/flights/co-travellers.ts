/**
 * Co-travellers: crewmates on the same flight, the same carrier and number departing at the same
 * scheduled instant ("Maya and Alex are on this flight."). Read from the crew-visible segments the
 * trip syncs, so an opted-out flight never names its traveller.
 */
export interface SegmentOwner {
  readonly ownerId: string;
  readonly carrier: string;
  readonly flightNo: string;
  readonly schedDepAt: string;
}

export function flightKey(segment: Omit<SegmentOwner, 'ownerId'>): string {
  return `${segment.carrier}:${segment.flightNo}:${new Date(segment.schedDepAt).toISOString()}`;
}

/** Everyone else on `mine`'s flight, in the order their segments came. */
export function coTravellers(mine: SegmentOwner, crew: readonly SegmentOwner[]): string[] {
  const key = flightKey(mine);
  const others = crew.filter(
    (segment) => segment.ownerId !== mine.ownerId && flightKey(segment) === key,
  );
  return [...new Set(others.map((segment) => segment.ownerId))];
}
