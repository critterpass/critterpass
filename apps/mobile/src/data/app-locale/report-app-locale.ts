/**
 * Tells the server which language this person's app is in (`set_app_locale`,
 * docs/api-contracts.md §4.1), so the guide's replies, pushes and guide-written text reach them in
 * it. The app resolves its own UI language (lib/i18n: the person's choice, else the phone's
 * preference among the shipped languages, else English); that resolved language is reported, never
 * the raw device tag.
 *
 * Reported once the session is up, and again on every language change. The last reported value is
 * kept per uid, so a relaunch in the same language sends nothing. The command waits in the offline
 * queue like any other, so a launch without network still gets through later.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: a command name and storage
   values, never rendered copy. */
import { isAppLocale, type SetAppLocalePayload } from '@cp/domain';

import type { CommandClient } from '../commands/client';
import { defineClientCommand } from '../commands/summaries';

export const setAppLocaleCommand = defineClientCommand<SetAppLocalePayload>({
  name: 'set_app_locale',
  offline: true,
});

export interface AppLocaleSource {
  /** The active UI language; `undefined` until the first one is activated. */
  current(): string | undefined;
  /** Calls back on every real language change (the first activation included). */
  onChange(listener: (locale: string) => void): () => void;
}

/** What was last handed to the command queue, as `<uid>:<locale>`. */
export interface ReportedLocaleStore {
  read(): string | null;
  write(value: string): void;
}

export interface AppLocaleReportDeps {
  readonly uid: string;
  readonly commands: Pick<CommandClient, 'send'>;
  readonly locale: AppLocaleSource;
  readonly reported: ReportedLocaleStore;
  readonly onError: (error: unknown) => void;
}

export interface AppLocaleReport {
  /** Resolves once every report started so far has been queued (or has failed). */
  settled(): Promise<void>;
  stop(): void;
}

export function startAppLocaleReport(deps: AppLocaleReportDeps): AppLocaleReport {
  let chain: Promise<void> = Promise.resolve();

  async function report(locale: string | undefined): Promise<void> {
    // Development-only locales (the pseudo locale) are not languages the server writes in.
    if (!isAppLocale(locale)) return;
    const value = `${deps.uid}:${locale}`;
    if (deps.reported.read() === value) return;
    await deps.commands.send(setAppLocaleCommand, { locale });
    deps.reported.write(value);
  }

  // One at a time and in order, so two quick switches reach the server as they happened.
  const enqueue = (locale: string | undefined) => {
    chain = chain.then(() => report(locale)).catch(deps.onError);
  };

  const unsubscribe = deps.locale.onChange(enqueue);
  enqueue(deps.locale.current());
  return { settled: () => chain, stop: unsubscribe };
}
