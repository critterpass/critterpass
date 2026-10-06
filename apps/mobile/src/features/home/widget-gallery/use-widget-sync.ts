/**
 * Refreshes the widgets from inside the signed-in session: on launch and whenever the app comes
 * back to the foreground (at most every fifteen minutes, the server's own debounce), it fetches
 * the widget snapshot with the session, writes it to the App Group when it changed, and reports
 * the placed widgets. Pushes between those times are the widget extension's job.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a route path, headers and command names, never copy. */
import type { RegisterWidgetTokenPayload, SyncInstalledWidgetsPayload } from '@cp/domain';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { expoPushNative } from '@/data/push/expo-native';
import { toApnsEnv } from '@/data/push/tokens';

import { installedWidgetPorts, type WidgetPorts } from './widget-ports';
import { syncWidgets, type WidgetSnapshotFetch } from './widget-snapshot-sync';
import { createWidgetSnapshotWriter } from './write-widget-snapshot';

export const SYNC_INSTALLED_WIDGETS = defineClientCommand<SyncInstalledWidgetsPayload>({
  name: 'sync_installed_widgets',
  offline: true,
});

export const REGISTER_WIDGET_TOKEN = defineClientCommand<RegisterWidgetTokenPayload>({
  name: 'register_widget_token',
  offline: true,
});

/** Foreground refreshes are at least this far apart (the server debounces pushes the same). */
export const WIDGET_FOREGROUND_REFRESH_MS = 15 * 60_000;

/** `GET /v1/widgets/snapshot` with the session; a 304 or any failure is "nothing new". */
export function sessionSnapshotFetch(): () => Promise<WidgetSnapshotFetch> {
  let etag: string | null = null;
  return async () => {
    try {
      const response = await fetch(`${resolveApiBaseUrl()}/v1/widgets/snapshot`, {
        headers: {
          accept: 'application/json',
          ...(etag === null ? {} : { 'if-none-match': etag }),
          ...(await sessionHeaders()),
        },
      });
      if (!response.ok) return { kind: 'unavailable' };
      etag = response.headers.get('etag');
      return { kind: 'ok', body: (await response.json()) as unknown };
    } catch {
      return { kind: 'unavailable' };
    }
  };
}

export function useWidgetSync(
  ports: WidgetPorts | null = installedWidgetPorts(),
  fetchSnapshot: () => Promise<WidgetSnapshotFetch> = sessionSnapshotFetch(),
  now: () => number = Date.now,
): void {
  const { send } = useCommand(SYNC_INSTALLED_WIDGETS);
  const { send: sendToken } = useCommand(REGISTER_WIDGET_TOKEN);
  useEffect(() => {
    if (ports === null) return undefined;
    const writer = createWidgetSnapshotWriter(ports.sink);
    let last = -Infinity;
    // Each session registers the token once (it belongs to the install, and the account may be new).
    let registered: string | null = null;
    const registerToken = async (token: string) => {
      if (token === registered) return;
      registered = token;
      const apnsEnv = toApnsEnv(await expoPushNative.getApnsEnvironment());
      await sendToken({ widget_kind: 'all', token, apns_env: apnsEnv });
    };
    const refresh = () => {
      if (now() - last < WIDGET_FOREGROUND_REFRESH_MS) return;
      last = now();
      void syncWidgets({
        fetchSnapshot,
        writer,
        installed: ports.installed,
        syncInstalled: (payload) => send(payload),
        pushToken: ports.pushToken,
        registerToken,
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
    // `fetchSnapshot` and `now` are fixed for the session; the effect follows the ports.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports, send, sendToken]);
}
