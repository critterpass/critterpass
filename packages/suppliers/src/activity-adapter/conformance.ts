/**
 * The conformance run every activity adapter passes on its partner's recorded responses before its
 * switch may turn on: search → (hold) → book → status → cancel quote → cancel, checking the truths
 * the app's copy relies on. It returns findings rather than asserting, so each partner's test file
 * runs it on its own fixtures and expects no findings.
 */
import type { BookRequest, HoldRequest, OfferQuery } from '../core/adapter';
import { capabilityMismatches, type ActivityAdapter } from './contract';

export interface ConformanceScenario {
  readonly query: OfferQuery;
  /** Absent for a partner without holds. */
  readonly hold?: HoldRequest;
  /** Built from the hold when there is one (its `holdRef` is filled in). */
  readonly book: Omit<BookRequest, 'holdRef'> & { readonly holdRef?: string };
  readonly cancelReason: string;
}

export async function runActivityConformance(
  adapter: ActivityAdapter,
  scenario: ConformanceScenario,
): Promise<string[]> {
  const findings = capabilityMismatches(adapter).map((c) => `capability ${c} disagrees`);
  const offers = await adapter.search(scenario.query);
  if (offers.length === 0) findings.push('search returned no offers');
  for (const offer of offers) {
    if (offer.supplier !== adapter.id) findings.push(`offer ${offer.productCode} not attributed`);
    if (Number.isNaN(Date.parse(offer.seenAt)))
      findings.push(`offer ${offer.productCode} has no seen time`);
    if (offer.holdSupported && !adapter.capabilities.hold) {
      findings.push(`offer ${offer.productCode} claims a hold the partner cannot give`);
    }
  }
  let holdRef = scenario.book.holdRef;
  if (scenario.hold !== undefined) {
    if (adapter.hold === undefined) {
      findings.push('scenario holds but the adapter has no hold');
    } else {
      const hold = await adapter.hold(scenario.hold);
      if (hold.holdProvided !== (hold.seatsHeldUntil !== undefined)) {
        findings.push('hold says seats are held without a deadline, or the reverse');
      }
      holdRef = hold.holdRef;
    }
  }
  if (holdRef === undefined) return [...findings, 'nothing to book'];
  const booked = await adapter.book({ ...scenario.book, holdRef });
  if (booked.status === 'confirmed' && booked.voucher === undefined) {
    findings.push('a confirmed booking came back without its voucher');
  }
  const ref = booked.items[0]?.bookingRef ?? booked.bookingRef;
  const status = await adapter.status(ref);
  if (!['confirmed', 'pending', 'rejected', 'cancelled', 'failed'].includes(status.status)) {
    findings.push(`status ${status.status} is not a booking state`);
  }
  const quote = await adapter.cancelQuote(ref);
  if (quote.cancellable && quote.refund === null)
    findings.push('a cancellable quote has no refund');
  const cancelled = await adapter.cancel(ref, scenario.cancelReason);
  if (cancelled.status !== 'cancelled' && cancelled.status !== 'rejected') {
    findings.push('cancel answered neither cancelled nor rejected');
  }
  return findings;
}
