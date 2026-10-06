/**
 * The console navigation: modules grouped as the design sets them (—, QUEUES, PEOPLE, CONTENT,
 * PLATFORM, GOVERNANCE), filtered by role, each with its `/counts` badge (urgent pink, warn
 * orange, plain), and the operator chip with sign-out.
 */
import {
  ADMIN_COUNTS_POLL_SECONDS,
  adminCountsSchema,
  type AdminArea,
  type AdminCounts,
} from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import gecko from '../assets/stickers/gecko.webp';
import { visibleModules, type AdminModule } from '../kit/registry';
import { getJson } from '../lib/api';
import { useOperator, useSignOut } from '../lib/session';
import { ADMIN_MODULES } from './modules';

export const NAV_GROUPS = ['', 'Queues', 'People', 'Content', 'Platform', 'Governance'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/** Which group each module sits in; a module missing here lands in Platform. */
const MODULE_GROUP: Readonly<Record<string, NavGroup>> = {
  work: '',
  moderation: 'Queues',
  desk: 'Queues',
  'vendor-desk': 'Queues',
  feedback: 'Queues',
  support: 'People',
  billing: 'People',
  catalogue: 'Content',
  season: 'Content',
  costs: 'Content',
  content: 'Content',
  community: 'Content',
  flags: 'Platform',
  partners: 'Platform',
  services: 'Platform',
  jobs: 'Platform',
  audit: 'Governance',
  operators: 'Governance',
};

export function moduleGroup(module: AdminModule): NavGroup {
  return MODULE_GROUP[module.id] ?? 'Platform';
}

/** Modules sharing an area (desk and vendor desk) show its badge once, on the first. */
export function badgeAreas(modules: readonly AdminModule[]): ReadonlyMap<string, AdminArea> {
  const seen = new Set<AdminArea>();
  const owners = new Map<string, AdminArea>();
  for (const module of modules) {
    if (seen.has(module.area)) continue;
    seen.add(module.area);
    owners.set(module.id, module.area);
  }
  return owners;
}

export const COUNTS_QUERY_KEY = ['admin', 'counts'] as const;

export function useCounts() {
  return useQuery({
    queryKey: COUNTS_QUERY_KEY,
    queryFn: () => getJson('/v1/admin/counts', adminCountsSchema),
    refetchInterval: ADMIN_COUNTS_POLL_SECONDS * 1000,
  });
}

export function CountBadge({ counts, area }: { counts: AdminCounts | undefined; area: AdminArea }) {
  const count = counts?.[area];
  if (count === undefined || count.count === 0) return null;
  return (
    <span className="nav-badge" data-tone={count.tone} aria-label={`${count.count} waiting`}>
      {count.count}
    </span>
  );
}

export function BrandMark() {
  return (
    <div className="brand">
      <img className="brand-critter" src={gecko} alt="" width={34} height={34} />
      <span className="brand-word">CritterPass</span>
      <span className="brand-tag">Ops</span>
    </div>
  );
}

export function Nav() {
  const me = useOperator();
  const signOut = useSignOut();
  const counts = useCounts();
  const modules = visibleModules(ADMIN_MODULES, me.roles);
  const badges = badgeAreas(modules);
  const role = me.roles[0] ?? 'no role';
  return (
    <nav className="shell-nav" aria-label="Console">
      <BrandMark />
      <div className="nav-groups">
        {NAV_GROUPS.map((group) => {
          const members = modules.filter((module) => moduleGroup(module) === group);
          if (group !== '' && members.length === 0) return null;
          return (
            <div key={group || 'top'} className="nav-group">
              {group !== '' && <div className="nav-group-label">{group}</div>}
              {group === '' && (
                <Link to="/" className="nav-link" activeOptions={{ exact: true }}>
                  Home
                </Link>
              )}
              {members.map((module) => {
                const first = module.routes[0];
                const area = badges.get(module.id);
                return first === undefined ? null : (
                  <Link key={module.id} to={`/${first.path}`} className="nav-link">
                    <span>{module.label}</span>
                    {area !== undefined && <CountBadge counts={counts.data} area={area} />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="nav-foot">
        <span className="op-avatar" aria-hidden="true">
          {(me.name || me.email).slice(0, 1).toUpperCase()}
        </span>
        <span className="op-chip" title={me.email}>
          <span className="op-name">{me.name || me.email}</span>
          <span className="op-role">{me.roles.join(' · ') || role}</span>
          <span className="sr-only">{me.email}</span>
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
