/**
 * The `snapshot/entitlements.json` App Group contract (docs/api-contracts-async.md §6: written by the
 * app, read by widgets/LA/NSE for locked-state rendering with no round trip). Every App Group JSON
 * file carries a `schema` version so a native reader can reject a shape it predates; this is the one
 * source both the app writer and the generated Swift/Kotlin Codable types read from
 * (docs/code-standards.md §14).
 */
import { z } from 'zod';

export const ENTITLEMENTS_SNAPSHOT_SCHEMA_VERSION = 1;

export const entitlementsSnapshotSchema = z.object({
  schema: z.literal(ENTITLEMENTS_SNAPSHOT_SCHEMA_VERSION),
  passPlus: z.boolean(),
  boostedTripIds: z.array(z.uuid()),
  /** The soonest Boost expiry among `boostedTripIds`, or `null` if the list is empty. A user can
   * have several boosted trips at once; this single field is only ever used for one lock-screen/
   * widget countdown at a time, so the nearest deadline is the one worth surfacing. */
  boostExpiresAt: z.iso.datetime({ offset: true }).nullable(),
  generatedAt: z.iso.datetime({ offset: true }),
});
export type EntitlementsSnapshot = z.infer<typeof entitlementsSnapshotSchema>;

export interface BoostedTrip {
  readonly tripId: string;
  readonly endsAt: string;
}

export interface BuildEntitlementsSnapshotInput {
  readonly passPlus: boolean;
  readonly boostedTrips: readonly BoostedTrip[];
  readonly generatedAt: Date;
}

/** Builds and validates a snapshot from already-resolved entitlement state (never from raw
 * `EntitlementSource` rows — the writer is expected to have called `packages/entitlements` first). */
export function buildEntitlementsSnapshot(
  input: BuildEntitlementsSnapshotInput,
): EntitlementsSnapshot {
  // Sorted by parsed instant, not string order: two offsets (+08:00 vs +00:00) do not compare
  // correctly as plain text.
  const soonestExpiry = [...input.boostedTrips]
    .sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt))
    .at(0)?.endsAt;

  return entitlementsSnapshotSchema.parse({
    schema: ENTITLEMENTS_SNAPSHOT_SCHEMA_VERSION,
    passPlus: input.passPlus,
    boostedTripIds: input.boostedTrips.map((trip) => trip.tripId),
    boostExpiresAt: soonestExpiry ?? null,
    generatedAt: input.generatedAt.toISOString(),
  });
}
