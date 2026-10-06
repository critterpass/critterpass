/**
 * Home (Ops-Home): greeting with what needs a human before the next due time, the on-call stamp,
 * one counter per queue the roles open, the five items assigned to me, recent admin activity, and
 * the services strip with AI spend today against its cap. Grafana and uptime stay link-outs.
 */
import { adminHomeSchema, type WorkItem } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import gecko from '../assets/stickers/gecko.webp';
import { visibleModules, type HomeCounter } from '../kit/registry';
import { EmptyState } from '../kit/states';
import { POLL_MS } from '../kit/table';
import { getJson } from '../lib/api';
import { useOperator } from '../lib/session';
import { PostBannerButton, useBanners } from '../modules/incidents/banners';
import { AREA_PATH, dueLabel, useMyWork } from '../modules/work/work-data';
import { ADMIN_MODULES } from './modules';

const LINK_OUTS = [
  { label: 'Grafana', url: import.meta.env.VITE_GRAFANA_URL },
  { label: 'Uptime', url: import.meta.env.VITE_UPTIME_URL },
].filter((link): link is { label: string; url: string } => typeof link.url === 'string');

const OPS_ZONE = 'Asia/Singapore';

export function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: OPS_ZONE })
      .formatToParts(now)
      .find((part) => part.type === 'hour')?.value ?? '12',
  );
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function Counter({ counter }: { counter: HomeCounter }) {
  const query = useQuery({
    queryKey: ['home', counter.id],
    queryFn: counter.load,
    refetchInterval: POLL_MS,
  });
  const warn = query.data !== undefined && query.data > (counter.warnAbove ?? Infinity);
  return (
    <Link to={counter.to} className="card counter" data-warn={warn}>
      <span className="section-label">{counter.label}</span>
      <span className="counter-value">{query.data ?? (query.isError ? '!' : '…')}</span>
    </Link>
  );
}

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(micros >= 100_000_000 ? 0 : 2)}`;
}

function AssignedRow({ item }: { item: WorkItem }) {
  return (
    <Link to={AREA_PATH[item.area] ?? '/work'} className="list-row">
      <span className="queue-tag">{item.queue.replaceAll('_', ' ')}</span>
      <span className="work-title">{item.title}</span>
      <span className="work-due mono">{dueLabel(item.due_at, new Date())}</span>
    </Link>
  );
}

export function HomePage() {
  const me = useOperator();
  const work = useMyWork();
  const banners = useBanners();
  const home = useQuery({
    queryKey: ['admin', 'home'],
    queryFn: () => getJson('/v1/admin/home', adminHomeSchema),
    refetchInterval: POLL_MS,
  });
  const counters = visibleModules(ADMIN_MODULES, me.roles)
    .flatMap((module) => module.homeCounters ?? [])
    .slice(0, 6);
  const now = new Date();
  const mine = work.data ? [...work.data.overdue, ...work.data.due_soon, ...work.data.later] : [];
  const urgent = work.data ? work.data.overdue.length + work.data.due_soon.length : 0;
  const firstName = (me.name || me.email).split(/[\s@]/)[0] ?? '';
  const stamp = now.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: OPS_ZONE,
  });
  const onCall = banners.data?.on_call ?? null;
  const services = home.data?.services;
  const cap = home.data?.ai_cap_usd ?? null;
  const spent = home.data?.ai_today_micros ?? 0;

  return (
    <div className="stack home">
      <section className="hero card">
        <div>
          <div className="mono muted">{stamp} SGT</div>
          <h1 className="hero-title">
            {greeting(now)}, {firstName}
          </h1>
          <p className="scribble">
            ↳{' '}
            {urgent === 0
              ? 'Nothing needs a human in the next two hours.'
              : `${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} a human in the next two hours.`}
          </p>
          <PostBannerButton />
        </div>
        {onCall !== null && (
          <div className="on-call" aria-label={`On call: ${onCall}`}>
            <span>On call</span>
            <span className="mono">{onCall}</span>
          </div>
        )}
        <img className="hero-sticker" src={gecko} alt="" width={128} height={128} />
      </section>

      {counters.length > 0 && (
        <div className="counter-grid">
          {counters.map((counter) => (
            <Counter key={counter.id} counter={counter} />
          ))}
        </div>
      )}

      <div className="home-columns">
        <section className="card stack" aria-label="Assigned to you">
          <div className="card-head">
            <span className="section-label">Assigned to you · {mine.length}</span>
            <Link to="/work">All my work →</Link>
          </div>
          {mine.length === 0 ? (
            <EmptyState title="Nothing assigned to you" />
          ) : (
            mine
              .slice(0, 5)
              .map((item) => <AssignedRow key={`${item.queue}:${item.item_id}`} item={item} />)
          )}
        </section>
        <section className="card stack" aria-label="Recent admin activity">
          <div className="card-head">
            <span className="section-label">Recent admin activity</span>
            {me.roles.some((role) => role === 'owner' || role === 'ops') && (
              <Link to="/audit">Audit log →</Link>
            )}
          </div>
          {home.data?.activity.length === 0 && <p className="muted">No console actions yet.</p>}
          {home.data?.activity.map((entry) => (
            <div key={entry.id} className="activity-row">
              <span className="op-avatar" aria-hidden="true">
                {(entry.operator ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{entry.operator?.split('@')[0] ?? 'system'}</strong> {entry.summary}
                <span className="mono muted"> {entry.action}</span>
              </span>
              <span className="muted">
                {new Date(entry.at).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: OPS_ZONE,
                })}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="card services-strip" aria-label="Services">
        <div>
          <div className="section-label">Services</div>
          <div className="strip-value">
            {services === undefined ? '…' : `${services.ok} of ${services.total} OK`}
          </div>
          {services !== undefined && (
            <div className="muted">
              {services.attention.length > 0
                ? services.attention.map((entry) => `${entry.name} ${entry.state}`).join(' · ')
                : `${services.unknown} not measured yet`}
            </div>
          )}
        </div>
        <div className="stack">
          <div className="section-label">AI spend today</div>
          <div>
            <strong>{usd(spent)}</strong>
            {cap !== null && <span className="muted"> of ${cap} cap</span>}
          </div>
          {cap !== null && cap > 0 && (
            <progress
              className="meter"
              max={cap * 1_000_000}
              value={Math.min(spent, cap * 1_000_000)}
            />
          )}
        </div>
        <div className="row">
          {LINK_OUTS.map((link) => (
            <a key={link.label} className="btn" href={link.url} target="_blank" rel="noreferrer">
              {link.label} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
