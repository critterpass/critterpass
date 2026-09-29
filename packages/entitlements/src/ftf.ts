/**
 * First trip free (entitlement matrix): a crew's first crew trip gets the Boost perks for free
 * once it is set up. A solo trip never qualifies (it can buy a Boost instead), and neither does a
 * crew's second trip.
 */
export interface FtfEligibilityInput {
  readonly isSolo: boolean;
  /** The crew's earlier crew trips that were not cancelled. */
  readonly earlierCrewTrips: number;
}

export function ftfEligible(input: FtfEligibilityInput): boolean {
  return !input.isSolo && input.earlierCrewTrips === 0;
}
