/**
 * DRIVERS (community): every driver listing with the crews' answers (loved / fine / not again),
 * trips and listed date, and its open rating-ring flags with their evidence. HOLD THOSE RATINGS
 * stops a listing's answers counting, TAKE DOWN removes it from the directory at once, CLEAR FLAG
 * closes a flag; each asks for a reason and is audited.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { PageHeader } from '../../app/shell';
import { ConfirmDialog } from '../../kit/confirm';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

const flagSchema = z.object({
  id: z.string(),
  kind: z.string(),
  evidence: z.record(z.string(), z.unknown()),
  status: z.string(),
  created_at: z.string(),
});
const listingSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  areas: z.array(z.string()),
  languages: z.array(z.string()),
  status: z.string(),
  show_ratings: z.boolean(),
  listed_at: z.string(),
  stats: z.object({
    crews_rated: z.number(),
    crews_loved: z.number(),
    crews_fine: z.number(),
    crews_not_again: z.number(),
    trips: z.number(),
  }),
  flags: z.array(flagSchema),
});
const listingsSchema = z.object({ listings: z.array(listingSchema) });
const ratingsSchema = z.object({
  ratings: z.array(z.object({ id: z.string(), verdict: z.string(), status: z.string() })),
});
type Listing = z.infer<typeof listingSchema>;

type Pending =
  | { readonly kind: 'hold'; readonly listing: Listing }
  | { readonly kind: 'take_down'; readonly listing: Listing }
  | { readonly kind: 'clear'; readonly listing: Listing; readonly flagId: string };

const TITLES: Record<Pending['kind'], string> = {
  hold: 'Hold those ratings',
  take_down: 'Take down this listing',
  clear: 'Clear this flag',
};

export function DriversPage() {
  const me = useOperator();
  const client = useQueryClient();
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const listings = useQuery({
    queryKey: ['driver-directory', flaggedOnly],
    queryFn: () =>
      getJson(
        `/v1/admin/driver-directory/listings${flaggedOnly ? '?flagged=true' : ''}`,
        listingsSchema,
      ),
    refetchInterval: POLL_MS,
  });

  async function confirm() {
    if (pending === null) return;
    setBusy(true);
    try {
      if (pending.kind === 'hold') {
        const { ratings } = await getJson(
          `/v1/admin/driver-directory/listings/${pending.listing.id}/ratings`,
          ratingsSchema,
        );
        const ids = ratings.filter((r) => r.status === 'visible').map((r) => r.id);
        if (ids.length > 0) {
          await runCommand(
            'hold_driver_ratings',
            { listing_id: pending.listing.id, rating_ids: ids },
            me.uid,
          );
        }
      } else if (pending.kind === 'take_down') {
        await runCommand(
          'take_down_driver_listing',
          { listing_id: pending.listing.id, reason },
          me.uid,
        );
      } else {
        await runCommand('clear_driver_flag', { flag_id: pending.flagId, reason }, me.uid);
      }
      setPending(null);
      setReason('');
      await client.invalidateQueries({ queryKey: ['driver-directory'] });
    } finally {
      setBusy(false);
    }
  }

  const items = listings.data?.listings ?? [];
  return (
    <div className="stack">
      <PageHeader
        title="Drivers"
        subtitle="Listings drivers confirmed themselves. Order in the app comes from crew answers only."
      />
      <label className="row">
        <input
          type="checkbox"
          checked={flaggedOnly}
          onChange={(e) => setFlaggedOnly(e.target.checked)}
        />
        Only listings with an open flag
      </label>
      {listings.isPending ? (
        <LoadingState />
      ) : listings.isError ? (
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={flaggedOnly ? 'No open flags' : 'No listings'} />
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Driver listings">
            <thead>
              <tr>
                <th scope="col">Driver</th>
                <th scope="col">Loved / fine / not again</th>
                <th scope="col">Trips</th>
                <th scope="col">Listed</th>
                <th scope="col">Flags</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <strong>{listing.display_name}</strong>
                    <div className="muted">{listing.areas.join(', ')}</div>
                    <span className="badge">{listing.status}</span>
                  </td>
                  <td className="mono">
                    {listing.stats.crews_loved} / {listing.stats.crews_fine} /{' '}
                    {listing.stats.crews_not_again}
                  </td>
                  <td className="mono">{listing.stats.trips}</td>
                  <td className="muted">{new Date(listing.listed_at).toLocaleDateString()}</td>
                  <td>
                    {listing.flags.map((flag) => (
                      <div key={flag.id} className="stack">
                        <span className="badge" data-tone="warning">
                          Anomaly flag · rating ring?
                        </span>
                        <pre className="mono">{JSON.stringify(flag.evidence, null, 1)}</pre>
                        <button
                          type="button"
                          onClick={() => setPending({ kind: 'clear', listing, flagId: flag.id })}
                        >
                          Clear flag
                        </button>
                      </div>
                    ))}
                  </td>
                  <td className="stack">
                    <button type="button" onClick={() => setPending({ kind: 'hold', listing })}>
                      Hold those ratings
                    </button>
                    <button
                      type="button"
                      onClick={() => setPending({ kind: 'take_down', listing })}
                    >
                      Take down
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={pending !== null}
        title={pending === null ? '' : TITLES[pending.kind]}
        confirmLabel={pending === null ? '' : TITLES[pending.kind]}
        tone={pending?.kind === 'take_down' ? 'danger' : 'default'}
        busy={busy || (pending?.kind !== 'hold' && reason.trim() === '')}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'hold' ? (
          <p>Every answer on {pending.listing.display_name} stops counting until it is reviewed.</p>
        ) : (
          <label className="stack">
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
