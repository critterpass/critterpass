/**
 * The role matrix, rendered from the same policy tables the api enforces: which roles open each
 * area and run each command (owner holds every role).
 */
import {
  ADMIN_AREAS,
  ADMIN_COMMAND_ROLES,
  ADMIN_ROLES,
  canOpenAdminArea,
  canRunAdminCommand,
} from '@cp/domain';

function Mark({ ok }: { ok: boolean }) {
  return <td className={ok ? 'matrix-yes' : 'matrix-no'}>{ok ? '✓' : '—'}</td>;
}

export function RoleMatrix() {
  return (
    <section className="card stack" aria-label="Role matrix">
      <h2 className="section-label">Role matrix</h2>
      <div className="table-wrap">
        <table className="table" aria-label="Areas by role">
          <thead>
            <tr>
              <th scope="col">Area</th>
              {ADMIN_ROLES.map((role) => (
                <th key={role} scope="col">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADMIN_AREAS.map((area) => (
              <tr key={area}>
                <td className="mono">{area}</td>
                {ADMIN_ROLES.map((role) => (
                  <Mark key={role} ok={canOpenAdminArea([role], area).ok} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Commands by role</summary>
        <div className="table-wrap">
          <table className="table" aria-label="Commands by role">
            <tbody>
              {Object.keys(ADMIN_COMMAND_ROLES)
                .sort()
                .map((command) => (
                  <tr key={command}>
                    <td className="mono">{command}</td>
                    {ADMIN_ROLES.map((role) => (
                      <Mark key={role} ok={canRunAdminCommand([role], command).ok} />
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
