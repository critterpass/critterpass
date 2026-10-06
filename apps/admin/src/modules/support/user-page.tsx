/**
 * One traveller: the header card (facts, revoke all sessions, ban/unban), entitlements and support
 * grants, their command trace, then every `userPanels` slot other modules register (deletion
 * status, feedback, ...). Each fix opens the reason dialog and runs one audited command.
 */
import { supportUserSchema, type SupportUser } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { ADMIN_MODULES } from '../../app/modules';
import { visibleModules } from '../../kit/registry';
import { ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ActionDialog, type SupportAction } from './action-dialog';
import { CommandTrace } from './command-trace';
import { AccountPanel } from './account-panel';
import { DevicesPanel, EntitlementsPanel, SessionsPanel } from './panels';
import type { OpenAction } from './use-user-command';

function Detail({ user, open }: { user: SupportUser; open: OpenAction }) {
  const me = useOperator();
  const panels = visibleModules(ADMIN_MODULES, me.roles).flatMap(
    (module) => module.userPanels ?? [],
  );
  return (
    <div className="stack">
      <AccountPanel user={user} open={open} />
      <div className="split">
        <div className="stack">
          <EntitlementsPanel user={user} open={open} />
          {panels.map((panel) => (
            <section key={panel.id} className="card stack" aria-label={panel.label}>
              <div className="section-label">{panel.label}</div>
              <panel.component uid={user.profile.uid} />
            </section>
          ))}
        </div>
        <div className="stack">
          <SessionsPanel user={user} open={open} />
          <DevicesPanel user={user} open={open} />
          <section className="card panel" aria-label="Commands">
            <div className="card-head">
              <span className="section-label">Command trace</span>
            </div>
            <CommandTrace query={`uid=${user.profile.uid}`} />
          </section>
        </div>
      </div>
    </div>
  );
}

export function SupportUserPage() {
  const params: unknown = useParams({ strict: false });
  const uid = (params as { uid?: string }).uid ?? '';
  const [action, setAction] = useState<SupportAction | null>(null);
  const user = useQuery({
    queryKey: ['support', 'user', uid],
    queryFn: () => getJson(`/v1/admin/users/${uid}`, supportUserSchema),
    refetchInterval: POLL_MS,
  });
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="page-eyebrow">People · Support</span>
        <Link to="/support" className="btn btn-ghost">
          Back to search
        </Link>
      </div>
      {user.isPending ? (
        <LoadingState />
      ) : user.isError ? (
        <ErrorState error={user.error} onRetry={() => void user.refetch()} />
      ) : (
        <Detail user={user.data} open={setAction} />
      )}
      <ActionDialog action={action} onClose={() => setAction(null)} />
    </div>
  );
}
