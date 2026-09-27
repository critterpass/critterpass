/** Where an audit row's subject lives in the console, when it has a page. */
import type { AuditEntry } from '@cp/domain';
import { Link } from '@tanstack/react-router';

const AREA_BY_KIND: Readonly<Record<string, string>> = {
  concierge_task: '/desk',
  config: '/flags',
  partner_adapter: '/partners',
  guides: '/catalogue',
  destinations: '/catalogue',
  pois: '/catalogue',
  poi: '/catalogue',
  operator: '/audit',
};

export function TargetLink({ entry }: { entry: AuditEntry }) {
  const keyed = entry.detail?.['key'] ?? entry.detail?.['partner'];
  const label = entry.target_id ?? (typeof keyed === 'string' ? keyed : '—');
  if (entry.target_kind === 'user' && entry.target_id !== null) {
    return (
      <Link to="/support/$uid" params={{ uid: entry.target_id }} className="mono">
        {label}
      </Link>
    );
  }
  const to = AREA_BY_KIND[entry.target_kind] ?? '/moderation';
  return (
    <Link to={to} className="mono">
      {label}
    </Link>
  );
}
