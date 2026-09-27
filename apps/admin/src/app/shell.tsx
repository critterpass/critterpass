/**
 * The signed-in layout: role-aware navigation built from the module registry, the operator and
 * sign-out, the offline banner, and the routed page. Signed-out visitors are sent to /sign-in.
 */
import { canOpenAdminArea } from '@cp/domain';
import { Link, Navigate, Outlet } from '@tanstack/react-router';
import type { ComponentType } from 'react';

import { visibleModules, type AdminModule } from '../kit/registry';
import { ErrorState, ForbiddenState, LoadingState, OfflineBanner } from '../kit/states';
import { isApiError } from '../lib/api';
import { useMe, useOperator, useSignOut } from '../lib/session';
import { ADMIN_MODULES } from './modules';

function Nav() {
  const me = useOperator();
  const signOut = useSignOut();
  const modules = visibleModules(ADMIN_MODULES, me.roles);
  return (
    <nav className="shell-nav" aria-label="Console">
      <div className="brand">
        <span className="brand-dot" aria-hidden="true" />
        CritterPass Ops
      </div>
      <Link to="/" className="nav-link" activeOptions={{ exact: true }}>
        Home
      </Link>
      {modules.map((module) => {
        const first = module.routes[0];
        return first === undefined ? null : (
          <Link key={module.id} to={`/${first.path}`} className="nav-link">
            {module.label}
          </Link>
        );
      })}
      <div className="nav-foot">
        <span>
          {me.email}
          <br />
          <span className="mono">{me.roles.join(' · ')}</span>
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </nav>
  );
}

export function Shell() {
  const me = useMe();
  const signOut = useSignOut();
  if (me.isPending) {
    return (
      <div className="shell-main">
        <LoadingState />
      </div>
    );
  }
  if (me.isError) {
    if (isApiError(me.error, 'AUTH_REQUIRED')) return <Navigate to="/sign-in" />;
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
      <div className="shell">
        <Nav />
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}

/** Renders a module page only for roles whose area allows it; a typed-in URL gets Forbidden. */
export function moduleGate(module: AdminModule, Page: ComponentType): () => React.JSX.Element {
  return function ModulePage() {
    const me = useOperator();
    if (!canOpenAdminArea(me.roles, module.area).ok) return <ForbiddenState />;
    return <Page />;
  };
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle !== undefined && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
