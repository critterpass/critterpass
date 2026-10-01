/**
 * The merge gate for app UI changes (`.github/workflows/ui-review.yml`, check `ui-reviewed`).
 *
 * A pull request that changes the app's screens (`apps/mobile/src/app`, `features` or `ui`, tests
 * aside) fails until it carries the `ui-reviewed` label, which a reviewer applies after looking
 * at the pull request's design | device sheets. A push that changes those files again takes the
 * label off, so a later change never merges on an earlier review.
 *
 *   node tools/scripts/ci-device/ui-review-gate.ts
 *
 * Reads GITHUB_REPOSITORY, PR_NUMBER, EVENT_ACTION, LABELS (JSON array of names), BEFORE and AFTER
 * (the push's commits, on `synchronize`), and GH_TOKEN for the GitHub API. Runs in a checkout of
 * the repository: what a push changed is read with git.
 */
import { execFileSync } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

export const UI_REVIEWED_LABEL = 'ui-reviewed';
const UI_ROOTS = ['apps/mobile/src/app/', 'apps/mobile/src/features/', 'apps/mobile/src/ui/'];
const NOT_UI = [
  /\/__tests__\//,
  /\/__mocks__\//,
  /\/__snapshots__\//,
  /\/test-support\//,
  /\.test\.tsx?$/,
];

/** True for a file that changes what the app shows: a screen, a feature or a shared component. */
export function isUiChange(file: string): boolean {
  return UI_ROOTS.some((root) => file.startsWith(root)) && !NOT_UI.some((re) => re.test(file));
}

export interface GateInput {
  readonly changed: readonly string[];
  readonly labelled: boolean;
  /** Files the latest push changed, on a `synchronize` event. */
  readonly pushed?: readonly string[];
}

export interface GateResult {
  readonly pass: boolean;
  readonly removeLabel: boolean;
  readonly message: string;
}

export function decide({ changed, labelled, pushed }: GateInput): GateResult {
  const ui = changed.filter(isUiChange);
  if (ui.length === 0)
    return { pass: true, removeLabel: false, message: 'No app UI files changed.' };
  const list = ui
    .slice(0, 20)
    .map((file) => `  ${file}`)
    .join('\n');
  const more = ui.length > 20 ? `\n  …and ${String(ui.length - 20)} more` : '';
  const pushedUi = (pushed ?? []).filter(isUiChange);
  if (labelled && pushedUi.length > 0) {
    return {
      pass: false,
      removeLabel: true,
      message: `This push changed app UI files after the review (${pushedUi.join(', ')}): the \`${UI_REVIEWED_LABEL}\` label is removed until the new sheets are reviewed.`,
    };
  }
  if (labelled) {
    return {
      pass: true,
      removeLabel: false,
      message: `UI changes reviewed (\`${UI_REVIEWED_LABEL}\`):\n${list}${more}`,
    };
  }
  return {
    pass: false,
    removeLabel: false,
    message: `This pull request changes app UI files:\n${list}${more}\nPost its design | device sheets (device workflow, mode compare) and add the \`${UI_REVIEWED_LABEL}\` label once they are reviewed.`,
  };
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...(cwd === undefined ? {} : { cwd }),
  });
}

function lines(text: string): string[] {
  return text.split('\n').filter(Boolean);
}

export interface RetryOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
}

/** Runs `read` until it succeeds, waiting a little longer after each failure. */
async function retrying<T>(
  read: () => T | Promise<T>,
  { attempts = 4, delayMs = 3000 }: RetryOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await wait(delayMs * attempt);
    }
  }
}

/** One page of `GET /repos/{owner}/{repo}/pulls/{n}/files`: its body and the next page, if any. */
export interface FilesPage {
  readonly body: unknown;
  readonly next?: string;
}

/** The `rel="next"` URL of a `Link` header. */
export function nextPage(link: string | null): string | undefined {
  return /<([^>]+)>;\s*rel="next"/.exec(link ?? '')?.[1];
}

function fileNames(body: unknown): string[] {
  if (!Array.isArray(body) || body.length === 0) {
    const got = Array.isArray(body) ? 'an empty page' : 'a page with no list';
    throw new Error(`GitHub returned ${got} of the pull request's files`);
  }
  return body.map((file: unknown) => {
    const name = (file as { filename?: unknown } | null)?.filename;
    if (typeof name !== 'string') throw new Error('GitHub returned a file with no name');
    return name;
  });
}

/**
 * Every file the pull request changes: all pages of the pull request files endpoint, following
 * each `Link: rel="next"`. A page that fails, comes back empty or carries no list is asked for
 * again and then fails the check. It is never read as "no files", which would pass a pull request
 * that changes the UI. (GitHub lists at most 3000 files of a pull request.)
 */
export async function pullRequestFiles(
  first: string,
  getPage: (url: string) => Promise<FilesPage>,
  retry: RetryOptions = {},
): Promise<string[]> {
  const files: string[] = [];
  let url: string | undefined = first;
  while (url !== undefined) {
    const page: string = url;
    const read = await retrying(async () => {
      const { body, next } = await getPage(page);
      return { names: fileNames(body), next };
    }, retry);
    files.push(...read.names);
    url = read.next;
  }
  return files;
}

async function githubPage(url: string): Promise<FilesPage> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GH_TOKEN ?? ''}`,
    },
  });
  if (!response.ok) throw new Error(`GitHub answered ${String(response.status)} for ${url}`);
  const body: unknown = await response.json();
  const next = nextPage(response.headers.get('link'));
  return { body, ...(next === undefined ? {} : { next }) };
}

/**
 * The files under the UI roots that differ between two commits, from git itself. GitHub's compare
 * endpoint lists at most 300 files, and only on its first page: a push that merges main in has no
 * complete list there (and a later page with no list crashed this gate).
 */
export function uiFilesBetween(before: string, after: string, cwd?: string): string[] {
  return lines(git(['diff', '--name-only', '--no-renames', before, after, '--', ...UI_ROOTS], cwd));
}

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const pr = process.env.PR_NUMBER ?? '';
  const labels = JSON.parse(process.env.LABELS ?? '[]') as string[];
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const changed = await pullRequestFiles(
    `${api}/repos/${repo}/pulls/${pr}/files?per_page=100`,
    githubPage,
  );
  const labelled = labels.includes(UI_REVIEWED_LABEL);
  const { BEFORE: before, AFTER: after } = process.env;
  // Only a labelled pull request has a review that a push can outdate.
  let pushed: string[] | undefined;
  if (
    labelled &&
    process.env.EVENT_ACTION === 'synchronize' &&
    before &&
    after &&
    !/^0+$/.test(before)
  ) {
    // The two heads alone, without their files' contents: the names come from their trees.
    const heads = ['--depth=1', '--filter=blob:none', 'origin', before, after];
    await retrying(() => git(['fetch', '--quiet', '--no-tags', ...heads]), {});
    pushed = uiFilesBetween(before, after);
  }
  const result = decide({ changed, labelled, ...(pushed ? { pushed } : {}) });
  if (result.removeLabel)
    gh(['pr', 'edit', pr, '--repo', repo, '--remove-label', UI_REVIEWED_LABEL]);
  if (result.pass) {
    console.log(result.message);
    return;
  }
  console.log(`::error title=UI review needed::${result.message.replace(/\n/g, '%0A')}`);
  process.exitCode = 1;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
