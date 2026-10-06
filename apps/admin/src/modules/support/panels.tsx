/** The support user detail's built-in panels. Values shown are never C3 (see the api contract). */
import type { SupportUser } from '@cp/domain';

import { EmptyState } from '../../kit/states';
import { useUserCommand, type OpenAction } from './use-user-command';

export const when = (value: string | null) =>
  value === null ? '—' : new Date(value).toLocaleString();

export interface PanelProps {
  readonly user: SupportUser;
  readonly open: OpenAction;
}

export const day = (value: string | null) =>
  value === null
    ? '—'
    : new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });

export function SessionsPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  return (
    <section className="card panel" aria-label="Sessions">
      <div className="card-head">
        <span className="section-label">Sessions · {user.sessions.length}</span>
        <span className="muted">no IP or location is kept here</span>
      </div>
      {user.sessions.length === 0 ? (
        <EmptyState title="No live sessions" />
      ) : (
        user.sessions.map((session) => (
          <div key={session.id} className="panel-row">
            <span>
              <strong>{session.user_agent ?? 'Unknown client'}</strong>
              <br />
              <span className="mono muted">
                created {day(session.created_at)} · ends {day(session.expires_at)}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                open({
                  title: 'Revoke this session',
                  body: 'That device is signed out on its next request.',
                  confirmLabel: 'Revoke session',
                  run: ({ reason }) => run('revoke_session', { session_id: session.id, reason }),
                })
              }
            >
              Revoke
            </button>
          </div>
        ))
      )}
    </section>
  );
}

export function DevicesPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  return (
    <section className="card panel" aria-label="Devices">
      <div className="card-head">
        <span className="section-label">Device action keys · {user.devices.length}</span>
      </div>
      {user.devices.length === 0 ? (
        <EmptyState title="No devices" />
      ) : (
        user.devices.map((device) => (
          <div key={device.id} className="panel-row">
            <span>
              <strong>
                {device.platform} {device.os_version ?? ''} · app {device.app_version}
              </strong>
              <br />
              <span className="mono muted">last seen {when(device.last_seen_at)}</span>
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                open({
                  title: 'Revoke device action keys',
                  body: 'Widgets, notification actions and Live Activities on this device stop working until the app issues new keys.',
                  confirmLabel: 'Revoke keys',
                  run: ({ reason }) => run('revoke_device_key', { device_id: device.id, reason }),
                })
              }
            >
              Revoke keys
            </button>
          </div>
        ))
      )}
    </section>
  );
}

export function EntitlementsPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  const active = user.grants.filter(
    (grant) => grant.revoked_at === null && new Date(grant.until) > new Date(),
  );
  return (
    <section className="card panel" aria-label="Entitlements">
      <div className="card-head">
        <span className="section-label">Entitlements</span>
        <span className="mono muted">computed {when(user.entitlements?.computed_at ?? null)}</span>
      </div>
      <div className="panel-row">
        <span className="row">
          <span className="badge" data-tone={user.entitlements?.pass_plus ? 'warning' : undefined}>
            Pass+
          </span>
          <strong>{user.entitlements?.pass_plus ? 'active' : 'free'}</strong>
        </span>
        <span className="mono muted">
          {user.entitlements?.expires_at ? `until ${when(user.entitlements.expires_at)}` : ''}
        </span>
      </div>
      {user.grants.map((grant) => (
        <div key={grant.id} className="panel-row">
          <span>
            <strong>
              {grant.perk.replace('_', ' ')} until {day(grant.until)}
            </strong>
            <br />
            <span className="mono muted">
              {grant.reason} · by {grant.granted_by}
            </span>
          </span>
          {grant.revoked_at !== null && (
            <span className="muted">revoked {day(grant.revoked_at)}</span>
          )}
        </div>
      ))}
      <div className="panel-row" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            open({
              title: 'Grant Pass+',
              body: 'Pass+ unlocks for this traveller until the end of the chosen day.',
              confirmLabel: 'Grant Pass+',
              until: 'required',
              run: ({ reason, until }) =>
                run('grant_entitlement', { perk: 'pass_plus', until, reason }),
            })
          }
        >
          Grant Pass+
        </button>
        {active.length > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              open({
                title: 'Revoke the Pass+ grant',
                body: 'Pass+ from support grants ends now; purchases are untouched.',
                confirmLabel: 'Revoke grant',
                run: ({ reason }) => run('revoke_entitlement', { perk: 'pass_plus', reason }),
              })
            }
          >
            Revoke grant
          </button>
        )}
      </div>
    </section>
  );
}
