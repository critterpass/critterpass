/** The support user detail's built-in panels. Values shown are never C3 (see the api contract). */
import type { SupportUser } from '@cp/domain';

import { EmptyState } from '../../kit/states';
import { useUserCommand, type OpenAction } from './use-user-command';

const when = (value: string | null) => (value === null ? '—' : new Date(value).toLocaleString());

interface PanelProps {
  readonly user: SupportUser;
  readonly open: OpenAction;
}

export function AccountPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  const account = user.account;
  return (
    <section className="card stack" aria-label="Account">
      <h2 className="section-title">Account</h2>
      <dl className="kv">
        <dt>Username</dt>
        <dd className="mono">{user.profile.username ?? '—'}</dd>
        <dt>Status</dt>
        <dd>{user.profile.status}</dd>
        <dt>Member since</dt>
        <dd>{when(user.profile.member_since)}</dd>
        <dt>Home</dt>
        <dd>
          {[user.profile.home_country, user.profile.locale, user.profile.tz]
            .filter(Boolean)
            .join(' · ') || '—'}
        </dd>
        <dt>Sign-in</dt>
        <dd>
          {account === null
            ? 'No auth account'
            : [
                account.is_anonymous ? 'anonymous' : 'registered',
                account.has_email ? 'e-mail on file' : null,
                account.has_phone ? 'phone on file' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </dd>
        {account?.banned === true && (
          <>
            <dt>Banned</dt>
            <dd>
              <span className="badge" data-tone="urgent">
                banned
              </span>{' '}
              {account.ban_reason} · until{' '}
              {account.ban_expires ? when(account.ban_expires) : 'unbanned'}
            </dd>
          </>
        )}
      </dl>
      {account !== null && (
        <div className="row">
          {account.banned ? (
            <button
              type="button"
              className="btn"
              onClick={() =>
                open({
                  title: 'Unban this account',
                  body: 'They can sign in again straight away.',
                  confirmLabel: 'Unban',
                  run: ({ reason }) => run('unban_user', { reason }),
                })
              }
            >
              Unban
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                open({
                  title: 'Ban this account',
                  body: 'Every session ends now and sign-in is refused until the date you set.',
                  confirmLabel: 'Ban',
                  until: 'optional',
                  run: ({ reason, until }) => run('ban_user', { reason, until }),
                })
              }
            >
              Ban
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function SessionsPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  return (
    <section className="card stack" aria-label="Sessions">
      <h2 className="section-title">Sessions</h2>
      {user.sessions.length === 0 ? (
        <EmptyState title="No live sessions" />
      ) : (
        user.sessions.map((session) => (
          <div key={session.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {session.user_agent ?? 'Unknown client'}
              <br />
              <span className="muted">
                since {when(session.created_at)} · ends {when(session.expires_at)}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-danger"
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
    <section className="card stack" aria-label="Devices">
      <h2 className="section-title">Devices</h2>
      {user.devices.length === 0 ? (
        <EmptyState title="No devices" />
      ) : (
        user.devices.map((device) => (
          <div key={device.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              {device.platform} {device.os_version ?? ''} · app {device.app_version}
              <br />
              <span className="muted">last seen {when(device.last_seen_at)}</span>
            </span>
            <button
              type="button"
              className="btn btn-danger"
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
    <section className="card stack" aria-label="Entitlements">
      <h2 className="section-title">Entitlements</h2>
      <dl className="kv">
        <dt>Pass+</dt>
        <dd>
          <span className="badge" data-tone={user.entitlements?.pass_plus ? 'success' : undefined}>
            {user.entitlements?.pass_plus ? 'active' : 'free'}
          </span>{' '}
          {user.entitlements?.expires_at ? `until ${when(user.entitlements.expires_at)}` : ''}
        </dd>
        <dt>Computed</dt>
        <dd>{when(user.entitlements?.computed_at ?? null)}</dd>
      </dl>
      {user.grants.length > 0 && (
        <ul className="stack" style={{ margin: 0, paddingLeft: 'var(--space-16)' }}>
          {user.grants.map((grant) => (
            <li key={grant.id}>
              {grant.perk.replace('_', ' ')} until {when(grant.until)} — {grant.reason}{' '}
              <span className="muted">
                by {grant.granted_by}
                {grant.revoked_at ? ` · revoked ${when(grant.revoked_at)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
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
