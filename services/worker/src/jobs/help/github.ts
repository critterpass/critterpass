/**
 * The feedback tracker: issues in one private GitHub repository (`FEEDBACK_GITHUB_REPO`,
 * `owner/name`), written with `FEEDBACK_GITHUB_TOKEN`. Tickets hold what travellers wrote, so
 * nothing is sent to a repository the world can read: the repository's visibility is read from the
 * API before the first write and remembered for a while, and a public one refuses every write.
 */
const GITHUB_API_URL = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 15_000;
/** How long one visibility answer stands before it is read again. */
export const TRACKER_VISIBILITY_CACHE_MS = 10 * 60 * 1000;

export class TrackerNotPrivateError extends Error {
  constructor(repo: string) {
    super(`feedback tracker ${repo} is not a private repository; nothing was sent`);
    this.name = 'TrackerNotPrivateError';
  }
}

export class TrackerRequestError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(`feedback tracker: ${what} answered ${status}`);
    this.name = 'TrackerRequestError';
  }
}

export interface TrackerIssueDraft {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

export interface FeedbackTracker {
  readonly repo: string;
  /** Throws `TrackerNotPrivateError` unless the repository is private. */
  assertPrivate(): Promise<void>;
  /** The new issue's number. */
  createIssue(issue: TrackerIssueDraft): Promise<number>;
  comment(issueNumber: number, body: string): Promise<void>;
}

export interface GithubTrackerOptions {
  readonly repo: string;
  readonly token: string;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

export const TRACKER_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export function createGithubTracker(options: GithubTrackerOptions): FeedbackTracker {
  if (!TRACKER_REPO_PATTERN.test(options.repo)) {
    throw new Error('FEEDBACK_GITHUB_REPO must be owner/name');
  }
  const send = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const base = `${GITHUB_API_URL}/repos/${options.repo}`;
  let visibility: { readonly isPrivate: boolean; readonly at: number } | undefined;

  async function request(what: string, url: string, body?: unknown): Promise<unknown> {
    const response = await send(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'critterpass-feedback',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new TrackerRequestError(response.status, what);
    return response.json();
  }

  async function assertPrivate(): Promise<void> {
    if (visibility === undefined || now() - visibility.at >= TRACKER_VISIBILITY_CACHE_MS) {
      const repo = (await request('the repository', base)) as { private?: unknown };
      visibility = { isPrivate: repo.private === true, at: now() };
    }
    if (!visibility.isPrivate) throw new TrackerNotPrivateError(options.repo);
  }

  return {
    repo: options.repo,
    assertPrivate,
    async createIssue(issue) {
      await assertPrivate();
      const created = (await request('creating an issue', `${base}/issues`, {
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
      })) as { number?: unknown };
      if (typeof created.number !== 'number') {
        throw new TrackerRequestError(502, 'creating an issue (no number)');
      }
      return created.number;
    },
    async comment(issueNumber, body) {
      await assertPrivate();
      await request('commenting', `${base}/issues/${issueNumber}/comments`, { body });
    },
  };
}

export interface FeedbackTrackerEnv {
  readonly FEEDBACK_GITHUB_REPO?: string | undefined;
  readonly FEEDBACK_GITHUB_TOKEN?: string | undefined;
}

/** The tracker the environment names; `undefined` (forwarding off) unless both values are set. */
export function trackerFromEnv(
  env: FeedbackTrackerEnv,
  fetchImpl?: typeof fetch,
): FeedbackTracker | undefined {
  const repo = env.FEEDBACK_GITHUB_REPO?.trim();
  const token = env.FEEDBACK_GITHUB_TOKEN?.trim();
  if (repo === undefined || repo === '' || token === undefined || token === '') return undefined;
  return createGithubTracker({
    repo,
    token,
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}
