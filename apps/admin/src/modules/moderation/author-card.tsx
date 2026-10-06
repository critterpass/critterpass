/** Beside a report: who wrote the reported content and their history, and what each verdict does. */
import { moderationAuthorSchema, type ModerationVerdict } from '@cp/domain';
import { useQuery } from '@tanstack/react-query';

import { ErrorState, LoadingState } from '../../kit/states';
import { getJson } from '../../lib/api';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function AuthorCard({ uid }: { uid: string }) {
  const author = useQuery({
    queryKey: ['moderation', 'author', uid],
    queryFn: () => getJson(`/v1/admin/moderation/authors/${uid}`, moderationAuthorSchema),
  });
  return (
    <section className="card stack" aria-label="Author">
      <div className="section-label">Author</div>
      {author.isPending ? (
        <LoadingState rows={3} />
      ) : author.isError ? (
        <ErrorState error={author.error} onRetry={() => void author.refetch()} />
      ) : (
        <>
          <div className="row">
            <span className="op-avatar" aria-hidden="true">
              {(author.data.display_name ?? author.data.username ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{author.data.display_name ?? author.data.username ?? 'Unnamed'}</strong>
              <br />
              <span className="mono muted">
                {uid.slice(0, 8)}…{uid.slice(-4)}
              </span>
            </span>
          </div>
          <dl className="kv">
            <dt>Joined</dt>
            <dd>
              {new Date(author.data.joined_at).toLocaleDateString('en-GB', {
                month: 'short',
                year: 'numeric',
              })}
            </dd>
            <dt>Account</dt>
            <dd>{author.data.status}</dd>
            <dt>Crews</dt>
            <dd>
              {author.data.crews.length === 0
                ? '—'
                : author.data.crews.map((crew) => crew.name).join(', ')}
            </dd>
            <dt>Reports</dt>
            <dd>
              {author.data.reports_against.total} against, {author.data.reports_against.open} open
            </dd>
          </dl>
          {author.data.verdicts.length > 0 && (
            <div className="row" aria-label="Past verdicts">
              {author.data.verdicts.slice(0, 4).map((verdict) => (
                <span key={verdict.report_id} className="stamp" data-verdict={verdict.verdict}>
                  {verdict.verdict.replaceAll('_', ' ')}
                  <small>{shortDate(verdict.decided_at)}</small>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const GUIDE: Readonly<Record<ModerationVerdict, { tone: string; text: string }>> = {
  approve: { tone: 'approve', text: 'closes the reports; the content stays where it is.' },
  hide: { tone: 'warn', text: 'hides it from everyone but the author, who sees it marked hidden.' },
  remove: { tone: 'danger', text: 'deletes it for everyone, media included.' },
  ban_author: {
    tone: 'danger',
    text: 'removes it and bans the author, who is signed out everywhere.',
  },
};

export function VerdictGuide({ verdicts }: { verdicts: readonly ModerationVerdict[] }) {
  return (
    <section className="card stack" aria-label="What each verdict does">
      <div className="section-label">What each verdict does</div>
      {verdicts.map((verdict) => (
        <div key={verdict} className="verdict-guide" data-tone={GUIDE[verdict].tone}>
          <span className="dot" aria-hidden="true" />
          <span>
            <strong style={{ textTransform: 'capitalize' }}>{verdict.replaceAll('_', ' ')}</strong>{' '}
            {GUIDE[verdict].text}
          </span>
        </div>
      ))}
    </section>
  );
}
