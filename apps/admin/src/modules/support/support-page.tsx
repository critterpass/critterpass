/**
 * Support home: find a user by uid, e-mail, phone (E.164), 6-character join code or @username, and
 * trace one command by its op_id.
 */
import { supportLookupResponseSchema } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';

import { PageHeader } from '../../app/shell';
import { EmptyState, ErrorState, LoadingState } from '../../kit/states';
import { getJson } from '../../lib/api';
import { CommandTrace } from './command-trace';

/** What a lookup value looks like, shown as the operator types (the api decides for real). */
export function looksLike(value: string): string | null {
  const q = value.trim();
  if (q === '') return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) return 'a uid';
  if (/^\+[1-9]\d{6,14}$/.test(q)) return 'a phone';
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q)) return 'an email';
  if (q.startsWith('@')) return 'a username';
  if (/^[a-z0-9]{6}$/i.test(q)) return 'a join code';
  return null;
}

function SearchForm({
  label,
  placeholder,
  onSubmit,
  detect = false,
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  /** Shows what the value looks like beside the field. */
  detect?: boolean;
}) {
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() !== '') onSubmit(value.trim());
  };
  const kind = detect ? looksLike(value) : null;
  return (
    <form className="lookup" onSubmit={submit}>
      <span className="section-label" aria-hidden="true">
        {detect ? 'Find' : 'Trace'}
      </span>
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {kind !== null && <span className="queue-tag">Looks like {kind}</span>}
      <button type="submit" className="btn btn-primary">
        {label}
      </button>
    </form>
  );
}

function LookupResults({ q }: { q: string }) {
  const lookup = useQuery({
    queryKey: ['support', 'lookup', q],
    queryFn: () =>
      getJson(`/v1/admin/users?q=${encodeURIComponent(q)}`, supportLookupResponseSchema),
  });
  if (lookup.isPending) return <LoadingState rows={2} />;
  if (lookup.isError)
    return <ErrorState error={lookup.error} onRetry={() => void lookup.refetch()} />;
  if (lookup.data.items.length === 0) {
    return <EmptyState title="No user found">Check the value, or try another key.</EmptyState>;
  }
  return (
    <div className="table-wrap">
      <table className="table" aria-label="Matching users">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Username</th>
            <th scope="col">Account</th>
            <th scope="col">Matched by</th>
          </tr>
        </thead>
        <tbody>
          {lookup.data.items.map((user) => (
            <tr key={user.uid}>
              <td>
                <Link to="/support/$uid" params={{ uid: user.uid }}>
                  {user.display_name ?? 'Unnamed traveller'}
                </Link>
              </td>
              <td className="mono">{user.username ?? '—'}</td>
              <td>{user.status}</td>
              <td className="muted">{lookup.data.matched_by?.replace('_', ' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SupportPage() {
  const [q, setQ] = useState<string | null>(null);
  const [opId, setOpId] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHeader eyebrow="People" title="Support" />
      <div className="stack">
        <SearchForm
          label="Find user"
          placeholder="uid, e-mail, +84…, join code or @username"
          onSubmit={setQ}
          detect
        />
        <div className="muted">
          By uid, phone in +E.164, e-mail, 6-character join code or @username. Every change asks for
          a reason and is audited.
        </div>
        {q !== null && <LookupResults q={q} />}
      </div>
      <div className="stack">
        <SearchForm label="Trace op_id" placeholder="Command op_id" onSubmit={setOpId} />
        {opId !== null && <CommandTrace query={`op_id=${encodeURIComponent(opId)}`} />}
      </div>
    </div>
  );
}
