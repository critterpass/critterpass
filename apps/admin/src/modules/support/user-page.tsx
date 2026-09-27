/**
 * One traveller: profile and account (ban/unban), sessions, devices, entitlements and support
 * grants, their command trace, then every `userPanels` slot other modules register (deletion
 * status, feedback, ...). Each fix opens the reason dialog and runs one audited command.
 */
import { supportUserSchema, type SupportUser } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { ADMIN_MODULES } from '../../app/modules';
import { PageHeader } from '../../app/shell';
import { visibleModules } from '../../kit/registry';
import { ErrorState, LoadingState } from '../../kit/states';
import { POLL_MS } from '../../kit/table';
import { getJson } from '../../lib/api';
import { useOperator } from '../../lib/session';
import { ActionDialog, type SupportAction } from './action-dialog';
import { CommandTrace } from './command-trace';
import { AccountPanel, DevicesPanel, EntitlementsPanel, SessionsPanel } from './panels';
import type { OpenAction } from './use-user-command';

function Detail({ user, open }: { user: SupportUser; open: OpenAction }) {
  const me = useOperator();
  const panels = visibleModules(ADMIN_MODULES, me.roles).flatMap(
    (module) => module.userPanels ?? [],
  );
  return (
    <div className="stack">
      <div className="split">
        <AccountPanel user={user} open={open} />
        <EntitlementsPanel user={user} open={open} />
      </div>
      <div className="split">
        <SessionsPanel user={user} open={open} />
        <DevicesPanel user={user} open={open} />
      </div>
      <section className="card stack" aria-label="Commands">
        <h2 className="section-title">Recent commands</h2>
        <CommandTrace query={`uid=${user.profile.uid}`} />
      </section>
      {panels.map((panel) => (
        <section key={panel.id} className="card stack" aria-label={panel.label}>
          <h2 className="section-title">{panel.label}</h2>
          <panel.component uid={user.profile.uid} />
        </section>
      ))}
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
  const title = user.data?.profile.display_name ?? user.data?.profile.username ?? 'Traveller';
  return (
    <div className="stack">
      <PageHeader
        title={title}
        subtitle={uid}
        actions={
          <Link to="/support" className="btn">
            Back to search
          </Link>
        }
      />
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
