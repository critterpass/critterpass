/**
 * Booked costs the ledger does not have yet (a stay booked but not expensed): an optional provider
 * the bookings area registers. Until it does, the forecast counts plan items and actuals only.
 */
import type { RemainingCost } from './biggest-remaining';

export type BookedCostProvider = (tripId: string) => readonly RemainingCost[];

let provider: BookedCostProvider = () => [];

export function registerBookedCostProvider(next: BookedCostProvider): () => void {
  provider = next;
  return () => {
    if (provider === next) provider = () => [];
  };
}

export function bookedCosts(tripId: string): readonly RemainingCost[] {
  return provider(tripId);
}
