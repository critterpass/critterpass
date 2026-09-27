/**
 * Home: one counter per queue the operator's roles can open (each links to its queue), plus
 * link-outs to the uptime and Grafana dashboards instead of duplicating them here.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { visibleModules, type HomeCounter } from '../kit/registry';
import { EmptyState } from '../kit/states';
import { POLL_MS } from '../kit/table';
import { useOperator } from '../lib/session';
import { ADMIN_MODULES } from './modules';
import { PageHeader } from './shell';

const LINK_OUTS = [
  { label: 'Uptime', url: import.meta.env.VITE_UPTIME_URL },
  { label: 'Grafana', url: import.meta.env.VITE_GRAFANA_URL },
].filter((link): link is { label: string; url: string } => typeof link.url === 'string');

function Counter({ counter }: { counter: HomeCounter }) {
  const query = useQuery({
    queryKey: ['home', counter.id],
    queryFn: counter.load,
    refetchInterval: POLL_MS,
  });
  const warn = query.data !== undefined && query.data > (counter.warnAbove ?? Infinity);
  return (
    <Link to={counter.to} className="card counter" data-warn={warn}>
      <span className="counter-value">{query.data ?? (query.isError ? '!' : '…')}</span>
      <span className="muted">{counter.label}</span>
    </Link>
  );
}

export function HomePage() {
  const me = useOperator();
  const counters = visibleModules(ADMIN_MODULES, me.roles).flatMap(
    (module) => module.homeCounters ?? [],
  );
  return (
    <div className="stack">
      <PageHeader title={`Hi, ${me.name}`} subtitle="What needs a human right now." />
      {counters.length === 0 ? (
        <div className="card">
          <EmptyState>Your areas have no queues waiting.</EmptyState>
        </div>
      ) : (
        <div className="counter-grid">
          {counters.map((counter) => (
            <Counter key={counter.id} counter={counter} />
          ))}
        </div>
      )}
      {LINK_OUTS.length > 0 && (
        <div className="row">
          {LINK_OUTS.map((link) => (
            <a key={link.label} className="btn" href={link.url} target="_blank" rel="noreferrer">
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
