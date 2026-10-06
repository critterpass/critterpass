/** Command outcomes (`cmd_results`) for one op_id or one user, newest first. */
import { commandTraceResponseSchema } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { getJson } from '../../lib/api';

export function CommandTrace({ query }: { query: string }) {
  const trace = useQuery({
    queryKey: ['support', 'trace', query],
    queryFn: () => getJson(`/v1/admin/commands?${query}`, commandTraceResponseSchema),
  });
  if (trace.isPending) return <LoadingState rows={2} />;
  if (trace.isError) return <ErrorState error={trace.error} onRetry={() => void trace.refetch()} />;
  if (trace.data.items.length === 0) return <EmptyState title="No commands" />;
  return (
    <div role="list" aria-label="Command trace">
      {trace.data.items.map((item) => (
        <div key={item.op_id} role="listitem" className="panel-row">
          <span className="mono muted" style={{ minWidth: 52 }}>
            {new Date(item.server_ts).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong className="mono">{item.cmd}</strong>
            <br />
            <span className="mono muted">
              op {item.op_id}
              {item.code !== null ? ` · ${item.code}` : ''}
            </span>
          </span>
          <span className="queue-tag" data-many={item.status === 'rejected'}>
            {item.status}
          </span>
        </div>
      ))}
    </div>
  );
}
