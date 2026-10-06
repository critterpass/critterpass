/**
 * The store's own rating prompt (StoreKit's review request, Play's in-app review). The system
 * decides whether anything is shown and never says so: a resolved `true` only means the request
 * was made. Callers decide when to ask (after a good moment, never in a paid or stressed flow);
 * the OS caps how often the sheet really appears.
 */
import * as StoreReview from 'expo-store-review';

/** True when this device and build can ask (a store build with the review API available). */
export async function canRequestStoreReview(): Promise<boolean> {
  try {
    return (await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction());
  } catch {
    return false;
  }
}

/** Asks the store to show its rating prompt; `false` when it cannot be asked here. */
export async function requestStoreReview(): Promise<boolean> {
  if (!(await canRequestStoreReview())) return false;
  try {
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}

/** The app's store page to write a review on, when the build knows it. */
export function storeReviewUrl(): string | null {
  return StoreReview.storeUrl();
}
