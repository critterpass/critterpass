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
 * (the push's commits, on `synchronize`), and GH_TOKEN for the GitHub API.
 */
import { execFileSync } from 'node:child_process';

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

function lines(text: string): string[] {
  return text.split('\n').filter(Boolean);
}

function main(): void {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const pr = process.env.PR_NUMBER ?? '';
  const labels = JSON.parse(process.env.LABELS ?? '[]') as string[];
  const files = (endpoint: string, jq: string) =>
    lines(gh(['api', '--paginate', `repos/${repo}/${endpoint}`, '--jq', jq]));
  const changed = files(`pulls/${pr}/files?per_page=100`, '.[].filename');
  const { BEFORE: before, AFTER: after } = process.env;
  const pushed =
    process.env.EVENT_ACTION === 'synchronize' && before && after && !/^0+$/.test(before)
      ? files(`compare/${before}...${after}`, '.files[].filename')
      : undefined;
  const result = decide({
    changed,
    labelled: labels.includes(UI_REVIEWED_LABEL),
    ...(pushed ? { pushed } : {}),
  });
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
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
