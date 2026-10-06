/**
 * Account deletions by state: the accounts in their grace window (soonest purge first), the ones
 * that came back, and the ones already erased. Each row opens the traveller's support page, where
 * the deletion panel and its action live.
 */
import {
  ACCOUNT_DELETION_STATES,
  adminAccountDeletionsResponseSchema,
  type AccountDeletionState,
} from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { day, STATE_LABEL } from './format';

const TAB_LABEL: Readonly<Record<AccountDeletionState, string>> = {
  requested: 'In grace window',
  restored: 'Restored',
  purged: 'Purged',
};

export function DeletionsPage() {
  const [state, setState] = useState<AccountDeletionState>('requested');
  const deletions = useQuery({
    queryKey: ['account', 'deletions', state],
    queryFn: () =>
      getJson(`/v1/admin/account-deletions?state=${state}`, adminAccountDeletionsResponseSchema),
    refetchInterval: POLL_MS,
  });
  return (
    <div className="stack">
      <PageHeader
        eyebrow="People · Support"
        title="Account deletions"
        subtitle="A closed account can be restored for 30 days, then it is erased everywhere."
      />
      <div className="chips" role="tablist" aria-label="State">
        {ACCOUNT_DELETION_STATES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="chip"
            aria-selected={state === id}
            onClick={() => setState(id)}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      {deletions.isPending ? (
        <LoadingState />
      ) : deletions.isError ? (
        <ErrorState error={deletions.error} onRetry={() => void deletions.refetch()} />
      ) : deletions.data.items.length === 0 ? (
        <EmptyState title="No accounts here" />
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Account deletions">
            <thead>
              <tr>
                <th scope="col">Traveller</th>
                <th scope="col">State</th>
                <th scope="col">Asked</th>
                <th scope="col">Purge date</th>
                <th scope="col">From</th>
              </tr>
            </thead>
            <tbody>
              {deletions.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link to="/support/$uid" params={{ uid: item.uid }} className="mono">
                      {item.uid}
                    </Link>
                  </td>
                  <td>{STATE_LABEL[item.state]}</td>
                  <td>{day(item.requested_at)}</td>
                  <td>{day(item.purged_at ?? item.purge_at)}</td>
                  <td>{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
