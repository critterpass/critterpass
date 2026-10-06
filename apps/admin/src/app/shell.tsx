/**
 * The signed-in layout: role-aware navigation built from the module registry, the operator and
 * sign-out, the offline banner, and the routed page. Signed-out visitors are sent to /sign-in.
 */
import { canOpenAdminArea } from '@cp/domain';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useState, type ComponentType } from 'react';

import type { AdminModule } from '../kit/registry';
import { ErrorState, ForbiddenState, LoadingState, OfflineBanner } from '../kit/states';
import { Toaster } from '../kit/toast';
import { isApiError } from '../lib/api';
import { IncidentBanners } from '../modules/incidents/banners';
import { useMe, useOperator, useSignOut } from '../lib/session';
import { Nav } from './nav';
import { PhoneTabs } from '../phone/phone-tabs';
import { RefusedPass } from './sign-in';

/** The guard's refusal for a signed-in Google account that may not use the console. */
function refusalReason(error: unknown): 'not_listed' | 'no_role' | null {
  if (!isApiError(error, 'FORBIDDEN')) return null;
  const reason = (error.detail as { reason?: unknown } | undefined)?.reason;
  if (reason === 'not_allow_listed') return 'not_listed';
  if (reason === 'no_role') return 'no_role';
  return null;
}

export function Shell() {
  const me = useMe();
  const signOut = useSignOut();
  // The MORE sheet stays open only on the page it was opened from: navigating closes it.
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [moreOn, setMoreOn] = useState<string | null>(null);
  const moreOpen = moreOn === path;
  if (me.isPending) {
    return (
      <div className="shell-main">
        <LoadingState />
      </div>
    );
  }
  if (me.isError) {
    if (isApiError(me.error, 'AUTH_REQUIRED')) return <Navigate to="/sign-in" />;
    const reason = refusalReason(me.error);
    if (reason !== null) {
      return <RefusedPass kind={reason} email={null} onSignOut={() => void signOut()} />;
    }
    return (
      <div className="sign-in">
        <div className="card sign-in-card">
          <ErrorState error={me.error} onRetry={() => void me.refetch()} />
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <OfflineBanner />
      <Toaster />
      <div className="shell" data-more={moreOpen}>
        <Nav />
        <main className="shell-main">
          <IncidentBanners />
          <Outlet />
        </main>
        <PhoneTabs moreOpen={moreOpen} onMore={() => setMoreOn(moreOpen ? null : path)} />
      </div>
    </>
  );
}

/** Renders a module page only for roles whose area allows it; a typed-in URL gets Forbidden. */
export function moduleGate(module: AdminModule, Page: ComponentType): () => React.JSX.Element {
  return function ModulePage() {
    const me = useOperator();
    if (!canOpenAdminArea(me.roles, module.area).ok) {
      return <ForbiddenState area={module.area} label={module.label} />;
    }
    return <Page />;
  };
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow !== undefined && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle !== undefined && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
