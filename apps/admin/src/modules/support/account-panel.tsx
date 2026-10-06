import { day, when, type PanelProps } from './panels';
import { useUserCommand } from './use-user-command';

/** The header card: who this is, the facts support may see, and the account-wide actions. */
export function AccountPanel({ user, open }: PanelProps) {
  const run = useUserCommand(user.profile.uid);
  const account = user.account;
  const name = user.profile.display_name ?? user.profile.username ?? 'Traveller';
  return (
    <section className="card stack" aria-label="Account">
      <div className="user-head">
        <span className="user-avatar" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <div className="row">
            <h1 className="user-name">{name}</h1>
            {account?.banned === true ? (
              <span className="badge" data-tone="urgent">
                banned
              </span>
            ) : (
              <span className="badge" data-tone="success">
                {user.profile.status}
              </span>
            )}
            {user.entitlements?.pass_plus === true && (
              <span className="badge" data-tone="warning">
                Pass+
              </span>
            )}
            {account?.has_phone === true && <span className="badge">phone on file</span>}
            {account?.has_email === true && <span className="badge">e-mail on file</span>}
          </div>
          <dl className="facts">
            <div>
              <dt>Uid</dt>
              <dd className="mono">{user.profile.uid}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd className="mono">{user.profile.username ?? '—'}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>
                {day(user.profile.member_since)}
                {account === null
                  ? ' · no auth account'
                  : account.is_anonymous
                    ? ' · anonymous'
                    : ' · registered'}
              </dd>
            </div>
            <div>
              <dt>Locale · tz</dt>
              <dd>
                {[user.profile.home_country, user.profile.locale, user.profile.tz]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </div>
            {account?.banned === true && (
              <div>
                <dt>Ban</dt>
                <dd>
                  {account.ban_reason} · until{' '}
                  {account.ban_expires ? when(account.ban_expires) : 'unbanned'}
                </dd>
              </div>
            )}
          </dl>
        </div>
        {account !== null && (
          <div className="stack">
            <button
              type="button"
              className="btn"
              disabled={user.sessions.length === 0}
              onClick={() =>
                open({
                  title: 'Revoke all sessions',
                  body: `Signs this traveller out of the app on every device (${user.sessions.length} live). Console sessions are not touched.`,
                  confirmLabel: 'Revoke all sessions',
                  run: ({ reason }) => run('revoke_all_sessions', { reason }),
                })
              }
            >
              Revoke all sessions
            </button>
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
      </div>
      <div className="private-note">
        <span className="section-label">Not shown here</span> Budgets, payout details, insurance,
        dietary profile, contact details and raw location are private. There is no impersonation;
        this view is read-only.
      </div>
    </section>
  );
}
