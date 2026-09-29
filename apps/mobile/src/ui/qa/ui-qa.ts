import type * as ExpoFileSystemModule from 'expo-file-system';
import Constants from 'expo-constants';

/**
 * Runtime UI checks for development and e2e builds: shared components report layout problems the
 * design never allows (a headline cut with an ellipsis, a word split across lines, a one-line
 * label that wrapped, a critter without its sticker edge, header controls running into each other,
 * a pushed screen with no way back, an icon that draws nothing). Each report is a `[ui-qa]` console warning plus a line in
 * `<documents>/ui-qa.log`, which `pnpm screens:capture` reads back after every Maestro flow and
 * fails on. Store builds (staging, production) never report: the gate is read once at load.
 */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a log file name, never shown to a user
export const UI_QA_LOG_FILE = 'ui-qa.log';
// eslint-disable-next-line lingui/no-unlocalized-strings -- a log tag, never shown to a user
export const UI_QA_TAG = '[ui-qa]';

export type UiQaCode =
  | 'TEXT_TRUNCATED'
  | 'TEXT_WORD_BROKEN'
  | 'TEXT_WRAPPED'
  | 'STICKER_NO_OUTLINE'
  | 'HEADER_OVERLAP'
  | 'NO_BACK_AFFORDANCE'
  | 'ICON_EMPTY';

function readVariant(): unknown {
  return Constants.expoConfig?.extra?.appVariant;
}

/** On in dev (Metro) builds and in the `development` variant the e2e-test build ships. */
export const UI_QA_ENABLED: boolean = __DEV__ || readVariant() === 'development';

export type UiQaSink = (line: string) => void;

function fileSink(): UiQaSink {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load: only QA builds ever reach it
  const { File, Paths } = require('expo-file-system') as typeof ExpoFileSystemModule;
  const file = new File(Paths.document, UI_QA_LOG_FILE);
  return (line) => {
    try {
      if (!file.exists) file.create();
      file.writeSync(`${line}\n`, { append: true });
    } catch {
      // The console line still carries the report.
    }
  };
}

let sink: UiQaSink | null = null;
const seen = new Set<string>();

function defaultSink(): UiQaSink {
  const toFile = fileSink();
  return (line) => {
    console.warn(line);
    toFile(line);
  };
}

/** Replaces where reports go (tests); `null` restores the console + file default. */
export function setUiQaSink(next: UiQaSink | null): void {
  sink = next;
  seen.clear();
}

/** Reports one problem once per code + subject, so a re-render doesn't flood the log. */
export function reportUiQa(code: UiQaCode, subject: string, detail?: string): void {
  if (!UI_QA_ENABLED) return;
  const key = `${code}|${subject}`;
  if (seen.has(key)) return;
  seen.add(key);
  sink ??= defaultSink();
  sink(`${UI_QA_TAG} ${code} ${JSON.stringify(subject)}${detail ? ` ${detail}` : ''}`);
}
