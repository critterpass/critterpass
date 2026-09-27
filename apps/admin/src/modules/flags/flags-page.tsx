/**
 * Flags & config: every typed key with its value, audience, what the app currently syncs and who
 * changed it last; selecting a key opens its editor.
 */
import { adminFlagsResponseSchema, type AdminFlag } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '../../app/shell';
import { formatValue } from '../../kit/diff';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { describeAudience } from './audience-input';
import { FlagEditor } from './flag-editor';

function when(iso: string | null): string {
  return iso === null
    ? '—'
    : new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function FlagsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: () => getJson('/v1/admin/flags', adminFlagsResponseSchema),
    refetchInterval: POLL_MS,
  });

  const items = flags.data?.items ?? [];
  const current: AdminFlag | undefined = items.find((flag) => flag.key === selected);
  return (
    <div className="stack">
      <PageHeader
        title="Flags & config"
        subtitle="Server-side limits and switches. Public keys sync to the app through client_config."
      />
      {flags.isPending ? (
        <LoadingState />
      ) : flags.isError ? (
        <ErrorState error={flags.error} onRetry={() => void flags.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No keys" />
      ) : (
        <div className="split split-wide">
          <div className="table-wrap">
            <table className="table" aria-label="Config keys">
              <thead>
                <tr>
                  <th scope="col">Key</th>
                  <th scope="col">Value</th>
                  <th scope="col">Audience</th>
                  <th scope="col">In the app</th>
                  <th scope="col">Changed</th>
                </tr>
              </thead>
              <tbody>
                {items.map((flag) => (
                  <tr
                    key={flag.key}
                    tabIndex={0}
                    data-selected={flag.key === selected}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(flag.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelected(flag.key);
                    }}
                  >
                    <td>
                      <div className="mono">{flag.key}</div>
                      <div className="row">
                        {flag.critical && (
                          <span className="badge" data-tone="warning">
                            critical
                          </span>
                        )}
                        {!flag.is_public && <span className="badge">server only</span>}
                        {flag.managed_by !== null && <span className="badge">partners</span>}
                      </div>
                    </td>
                    <td className="mono">{formatValue(flag.value)}</td>
                    <td>{describeAudience(flag.audience)}</td>
                    <td className="mono">
                      {flag.is_public ? formatValue(flag.client_value) : '—'}
                    </td>
                    <td className="muted">
                      {when(flag.updated_at)}
                      {flag.updated_by !== null && <div>{flag.updated_by}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current === undefined ? (
            <div className="card state">Pick a key to change it.</div>
          ) : (
            <FlagEditor
              key={`${current.key}:${current.version}`}
              flag={current}
              onSaved={() => undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}
