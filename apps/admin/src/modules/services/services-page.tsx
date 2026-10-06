/**
 * Services & spend (Ops-Services): spend this month against the budget, AI today against its cap,
 * how many services are healthy, AI by tier and its last 14 days, AI feature switches with today's
 * volume and spend, and every outside service grouped by domain. Switches are edited on Flags &
 * config (typed confirm, audited); a value nobody measured reads "unknown" or "—".
 */
import {
  SERVICE_GROUPS,
  SERVICE_GROUP_LABELS,
  servicesResponseSchema,
  type ServiceRow,
  type ServicesResponse,
} from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { PageHeader } from '../../app/shell';
import { ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';

const TIER_COLOURS: Readonly<Record<string, string>> = {
  fast: 'var(--color-blue)',
  pro: 'var(--color-yellow)',
  gemini: 'var(--color-pink)',
};

function usd(micros: number): string {
  const dollars = micros / 1_000_000;
  return dollars >= 100
    ? `$${Math.round(dollars).toLocaleString('en-US')}`
    : `$${dollars.toFixed(2)}`;
}

function Tile({
  label,
  value,
  of,
  note,
  tone,
}: {
  label: string;
  value: string;
  of?: string;
  note: string;
  tone?: string;
}) {
  return (
    <div className="card stack">
      <div className="card-head">
        <span className="section-label">{label}</span>
        {tone !== undefined && (
          <span className="state-pill" data-state="ok">
            {tone}
          </span>
        )}
      </div>
      <div>
        <span className="tile-value">{value}</span>
        {of !== undefined && <span className="muted"> {of}</span>}
      </div>
      <div className="muted">{note}</div>
    </div>
  );
}

function ServiceTableRow({ row }: { row: ServiceRow }) {
  return (
    <tr data-state={row.state}>
      <td>
        <strong>{row.name}</strong>
      </td>
      <td className="muted">{row.purpose}</td>
      <td>
        <span className="state-pill" data-state={row.state}>
          ● {row.state}
        </span>
      </td>
      <td className="mono">
        {row.p95_ms === null ? '—' : `${row.p95_ms} ms`} ·{' '}
        {row.error_rate === null ? '—' : `${(row.error_rate * 100).toFixed(1)}%`}
      </td>
      <td className="mono">{row.quota_used_pct === null ? '—' : `${row.quota_used_pct}%`}</td>
      <td className="mono">
        {row.month_spend === null
          ? '—'
          : `${(row.month_spend.amount_minor / 100).toFixed(2)} ${row.month_spend.currency}`}
      </td>
      <td className="mono">
        {row.switch_key === null ? (
          <span className="muted">none</span>
        ) : (
          <>
            {row.switch_on === false ? 'OFF ' : 'on '}
            {row.switch_key}
          </>
        )}
      </td>
    </tr>
  );
}

type RouteSpend = ServicesResponse['routes'][number];

function RouteTable({ routes }: { routes: readonly RouteSpend[] }) {
  if (routes.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="table">
        <tbody>
          {routes.map((route) => (
            <tr key={route.route}>
              <td className="mono">{route.switch_key}</td>
              <td className="mono">{route.tier ?? '—'}</td>
              <td>{route.calls_today} calls</td>
              <td className="mono">{usd(route.today_micros)}</td>
              <td>
                <span className="state-pill" data-state={route.enabled ? 'ok' : 'down'}>
                  {route.enabled ? 'on' : 'off'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ServicesPage() {
  const query = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => getJson('/v1/admin/services', servicesResponseSchema),
    refetchInterval: POLL_MS,
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const healthy = data.services.filter((row) => row.state === 'ok').length;
  const attention = data.services.filter((row) => row.state === 'degraded' || row.state === 'down');
  const unknown = data.services.filter((row) => row.state === 'unknown').length;
  // Features with calls today or switched off first; the quiet rest fold away.
  const busy = data.routes.filter((route) => route.calls_today > 0 || !route.enabled);
  const quiet = data.routes.filter((route) => route.calls_today === 0 && route.enabled);
  const dayMax = Math.max(
    1,
    ...data.ai_days.map((day) => Object.values(day.by_tier).reduce((a, b) => a + b, 0)),
  );

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Platform"
        title="Services & spend"
        subtitle="Every outside service we call, with its health, quota and spend, and the switch that turns our use of it off. Every switch is audited."
        actions={
          <Link to="/flags" className="btn">
            Edit switches
          </Link>
        }
      />
      <div className="tiles">
        <Tile
          label="Spend this month"
          value={usd(data.month_spend_micros)}
          {...(data.month_budget_usd !== null ? { of: `of $${data.month_budget_usd}` } : {})}
          note="AI from usage, other vendors from their billing or the owner's monthly entry."
        />
        <Tile
          label="AI today"
          value={usd(data.ai_today_micros)}
          {...(data.ai_cap_usd !== null ? { of: `of $${data.ai_cap_usd} cap` } : {})}
          note="Alerts at 80%, pauses at 100%."
        />
        <Tile
          label="Services"
          value={`${healthy}/${data.services.length}`}
          of="healthy"
          note={
            attention.length > 0
              ? attention.map((row) => `${row.name} ${row.state}`).join(' · ')
              : `${unknown} not measured yet.`
          }
        />
      </div>

      <div className="split">
        <section className="card stack" aria-label="AI by tier today">
          <div className="section-label">DeepSeek and fallback · by tier · today</div>
          {data.tiers.map((tier) => (
            <div key={tier.tier} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <span className="mono">{tier.tier}</span>{' '}
                {!tier.enabled && (
                  <span className="state-pill" data-state="down">
                    off
                  </span>
                )}
              </span>
              <span className="mono">
                {usd(tier.today_micros)}
                {tier.cap_usd !== null && ` / $${tier.cap_usd}`}
              </span>
            </div>
          ))}
          <p className="muted">
            Tiers never change on their own. Downgrades and caps are owner switches on Flags &
            config.
          </p>
        </section>
        <section className="card stack" aria-label="AI spend, last 14 days">
          <div className="section-label">AI spend · last 14 days</div>
          <div className="bars" role="img" aria-label="AI spend per day by tier">
            {data.ai_days.map((day) => (
              <div key={day.day} className="bar" title={day.day}>
                {Object.entries(day.by_tier).map(([tier, micros]) => (
                  <span
                    key={tier}
                    style={{
                      height: `${(micros / dayMax) * 140}px`,
                      background: TIER_COLOURS[tier] ?? 'var(--color-ink-300)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack" aria-label="AI features">
        <div className="section-label">AI features · kill switches · today</div>
        <RouteTable routes={busy} />
        {busy.length === 0 && <p className="muted">No AI calls today and every switch is on.</p>}
        {quiet.length > 0 && (
          <details>
            <summary className="muted">{quiet.length} more features, on and quiet today</summary>
            <RouteTable routes={quiet} />
          </details>
        )}
      </section>

      <section className="card stack" aria-label="Third-party services">
        <div className="section-label">Third-party services · {data.services.length}</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>We use it for</th>
                <th>Status</th>
                <th>p95 · errors</th>
                <th>Quota</th>
                <th>Spend</th>
                <th>Switch</th>
              </tr>
            </thead>
            {SERVICE_GROUPS.map((group) => {
              const rows = data.services.filter((row) => row.group === group);
              if (rows.length === 0) return null;
              return (
                <tbody key={group}>
                  <tr>
                    <th colSpan={7} className="section-label">
                      {SERVICE_GROUP_LABELS[group]}
                    </th>
                  </tr>
                  {rows.map((row) => (
                    <ServiceTableRow key={row.key} row={row} />
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>
    </div>
  );
}
