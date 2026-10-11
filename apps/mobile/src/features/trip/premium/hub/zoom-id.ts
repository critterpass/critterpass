/** Pairs a trip card with its hub's hero for the 1.05 zoom (the card's `ZoomLink` uses it too). */
export function tripZoomId(tripId: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a transition id, not copy
  return `trip-${tripId}`;
}
