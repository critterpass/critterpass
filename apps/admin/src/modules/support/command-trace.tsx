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
    <div className="table-wrap">
      <table className="table" aria-label="Command trace">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Command</th>
            <th scope="col">Outcome</th>
            <th scope="col">op_id</th>
          </tr>
        </thead>
        <tbody>
          {trace.data.items.map((item) => (
            <tr key={item.op_id}>
              <td className="muted">{new Date(item.server_ts).toLocaleString()}</td>
              <td className="mono">{item.cmd}</td>
              <td>
                <span
                  className="badge"
                  data-tone={item.status === 'rejected' ? 'urgent' : 'success'}
                >
                  {item.status}
                </span>{' '}
                {item.code !== null && <span className="mono">{item.code}</span>}
              </td>
              <td className="mono">{item.op_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
