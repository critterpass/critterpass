/** Audit filters: operator, action, target kind and id, date range (inclusive days). */
import { auditFacetsSchema } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getJson } from '../../lib/api';

export interface AuditFilters {
  admin?: string;
  action?: string;
  target_kind?: string;
  target_id?: string;
  from?: string;
  to?: string;
}

export function toQuery(filters: AuditFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' && value !== '') params.set(key, value);
  }
  return params.toString();
}

const dayStart = (day: string) => (day === '' ? '' : new Date(`${day}T00:00:00`).toISOString());
const dayAfter = (day: string) =>
  day === '' ? '' : new Date(new Date(`${day}T00:00:00`).getTime() + 86_400_000).toISOString();

export function FilterBar({ onApply }: { onApply: (filters: AuditFilters) => void }) {
  const facets = useQuery({
    queryKey: ['audit', 'facets'],
    queryFn: () => getJson('/v1/admin/audit/facets', auditFacetsSchema),
  });
  const [admin, setAdmin] = useState('');
  const [action, setAction] = useState('');
  const [targetKind, setTargetKind] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const apply = () =>
    onApply({
      admin,
      action,
      target_kind: targetKind.trim(),
      target_id: targetId.trim(),
      from: dayStart(from),
      to: dayAfter(to),
    });
  return (
    <form
      className="card filters"
      aria-label="Audit filters"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label className="field">
        <span className="field-label">Operator</span>
        <select className="select" value={admin} onChange={(event) => setAdmin(event.target.value)}>
          <option value="">Anyone</option>
          {facets.data?.admins.map((entry) => (
            <option key={entry.uid} value={entry.uid}>
              {entry.email}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Action</span>
        <select
          className="select"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        >
          <option value="">Any action</option>
          {facets.data?.actions.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Target kind</span>
        <input
          className="input"
          value={targetKind}
          onChange={(event) => setTargetKind(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">Target id</span>
        <input
          className="input mono"
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">From</span>
        <input
          className="input"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field-label">To</span>
        <input
          className="input"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
      <div className="row">
        <button type="submit" className="btn btn-primary">
          Apply
        </button>
      </div>
    </form>
  );
}
