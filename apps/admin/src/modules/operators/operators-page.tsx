/**
 * Operators (Ops-Operators, owner only): console accounts and their roles (one audited
 * `set_admin_role` per change), the role matrix and how access works.
 */
import { PageHeader } from '../../app/shell';
import { OperatorsPanel } from './operators-panel';
import { RoleMatrix } from './role-matrix';

const HOW_TO = [
  {
    title: 'Add someone',
    body: 'Add their work e-mail to ADMIN_ALLOWLIST with a role; they sign in with Google and appear here.',
  },
  {
    title: 'Change a role',
    body: 'Pick roles in the table below. It applies on their next request and is written to the audit log.',
  },
  {
    title: 'Remove someone',
    body: 'Clear every role: their console sessions end at once. Their app account is untouched.',
  },
] as const;

export function OperatorsPage() {
  return (
    <div className="stack">
      <PageHeader
        eyebrow="Governance"
        title="Operators"
        subtitle="Who can use the console, with which roles. Owners only."
      />
      <div className="tiles">
        {HOW_TO.map((card) => (
          <div key={card.title} className="card stack">
            <strong>{card.title}</strong>
            <span className="muted">{card.body}</span>
          </div>
        ))}
      </div>
      <OperatorsPanel />
      <RoleMatrix />
    </div>
  );
}
