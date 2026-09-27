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

function SearchForm({
  label,
  placeholder,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() !== '') onSubmit(value.trim());
  };
  return (
    <form className="row" onSubmit={submit}>
      <input
        className="input"
        style={{ flex: 1, minWidth: 220 }}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
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
      <PageHeader
        title="Support"
        subtitle="Find a traveller, then fix their account. Every change asks for a reason and is audited."
      />
      <div className="card stack">
        <SearchForm
          label="Find user"
          placeholder="uid, e-mail, +84…, join code or @username"
          onSubmit={setQ}
        />
        {q !== null && <LookupResults q={q} />}
      </div>
      <div className="card stack">
        <SearchForm label="Trace op_id" placeholder="Command op_id" onSubmit={setOpId} />
        {opId !== null && <CommandTrace query={`op_id=${encodeURIComponent(opId)}`} />}
      </div>
    </div>
  );
}
