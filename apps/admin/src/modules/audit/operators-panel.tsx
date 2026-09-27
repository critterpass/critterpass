/** Owners: console operators and their roles; a change is one audited `set_admin_role`. */
import { ADMIN_ROLES, operatorsResponseSchema, type AdminRole, type Operator } from '@cp/domain';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDialog } from '../../kit/confirm';
import { ErrorState, LoadingState } from '../../kit/states';
import { getJson, runCommand } from '../../lib/api';
import { useOperator } from '../../lib/session';

function RoleEditor({ operator }: { operator: Operator }) {
  const me = useOperator();
  const client = useQueryClient();
  const [roles, setRoles] = useState<readonly AdminRole[]>(operator.roles);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changed = [...roles].sort().join() !== [...operator.roles].sort().join();
  const save = async () => {
    setError(null);
    try {
      await runCommand(
        'set_admin_role',
        { uid: operator.uid, roles, reason: reason.trim() },
        me.uid,
      );
      await client.invalidateQueries({ queryKey: ['operators'] });
    } catch (caught) {
      setError(caught);
    } finally {
      setConfirming(false);
    }
  };
  return (
    <tr>
      <td>
        {operator.email}
        {!operator.allow_listed && <span className="badge"> not allow-listed</span>}
      </td>
      <td>
        <div className="row">
          {ADMIN_ROLES.map((role) => (
            <label key={role} className="toggle">
              <input
                type="checkbox"
                aria-label={`${operator.email} ${role}`}
                checked={roles.includes(role)}
                onChange={(event) =>
                  setRoles(
                    event.target.checked
                      ? [...roles, role]
                      : roles.filter((candidate) => candidate !== role),
                  )
                }
              />
              {role}
            </label>
          ))}
        </div>
      </td>
      <td>
        <button
          type="button"
          className="btn"
          disabled={!changed}
          onClick={() => setConfirming(true)}
        >
          Save roles
        </button>
        {error !== null && <ErrorState error={error} title="Roles not changed" />}
        <ConfirmDialog
          open={confirming}
          title={`Change roles for ${operator.email}`}
          confirmLabel="Change roles"
          tone="danger"
          busy={reason.trim().length < 3}
          onConfirm={() => void save()}
          onCancel={() => setConfirming(false)}
        >
          <div className="muted">
            New roles: {roles.length === 0 ? 'none (locked out)' : roles.join(', ')}. They apply on
            the operator’s next request.
          </div>
          <label className="field">
            <span className="field-label">Reason (kept in the audit log)</span>
            <textarea
              className="textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </ConfirmDialog>
      </td>
    </tr>
  );
}

export function OperatorsPanel() {
  const operators = useQuery({
    queryKey: ['operators'],
    queryFn: () => getJson('/v1/admin/operators', operatorsResponseSchema),
  });
  return (
    <section className="card stack" aria-label="Operators">
      <h2 className="section-title">Operators</h2>
      {operators.isPending ? (
        <LoadingState rows={2} />
      ) : operators.isError ? (
        <ErrorState error={operators.error} onRetry={() => void operators.refetch()} />
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label="Operator roles">
            <thead>
              <tr>
                <th scope="col">Operator</th>
                <th scope="col">Roles</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {operators.data.items.map((operator) => (
                <RoleEditor key={`${operator.uid}:${operator.roles.join()}`} operator={operator} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
