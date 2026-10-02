/**
 * Download my data on this phone: the newest export rows (synced, so the state follows the worker
 * without polling), asking for a new export (online: the server keeps the one-a-day rule), and
 * opening a ready one through a fresh signed link.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name and a route, never copy. */
import { dataExportLinkSchema, generateUuidV7, type RequestDataExportPayload } from '@cp/domain';
import { useState } from 'react';
import { Linking } from 'react-native';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  exportStateOf,
  LATEST_EXPORT_SQL,
  LATEST_EXPORT_TABLES,
  type ExportRow,
  type ExportState,
} from './export-state';

export const requestDataExportCommand = defineClientCommand<RequestDataExportPayload>({
  name: 'request_data_export',
  offline: false,
});

export type ExportProblem = 'offline' | 'too_soon' | 'refused' | 'link_failed' | null;

export async function fetchExportLink(id: string): Promise<string | null> {
  try {
    const { sessionHeaders } = await import('@/data/app-session/auth-client');
    const response = await fetch(`${resolveApiBaseUrl()}/v1/me/export/${id}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
    if (response.status !== 200) return null;
    const parsed = dataExportLinkSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.url : null;
  } catch {
    return null;
  }
}

export function useDataExport(now: () => Date = () => new Date()): {
  readonly state: ExportState;
  readonly busy: boolean;
  readonly problem: ExportProblem;
  readonly request: () => void;
  readonly open: () => void;
} {
  const uid = useOwnerUid();
  const { rows } = useLiveRows<ExportRow>(
    LATEST_EXPORT_SQL,
    uid === null ? null : [uid],
    LATEST_EXPORT_TABLES,
  );
  const { send } = useCommand(requestDataExportCommand);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ExportProblem>(null);
  const state = exportStateOf(rows, now());

  const request = () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    void send({ export_id: generateUuidV7() })
      .then((result) => {
        if (result.kind === 'unavailable') setProblem('offline');
        if (result.kind === 'rejected') {
          setProblem(result.code === 'STATE_INVALID' ? 'too_soon' : 'refused');
        }
      })
      .catch(() => setProblem('offline'))
      .finally(() => setBusy(false));
  };

  const open = () => {
    if (state.kind !== 'ready' || busy) return;
    setBusy(true);
    setProblem(null);
    void fetchExportLink(state.id)
      .then(async (url) => {
        if (url === null) setProblem('link_failed');
        else await Linking.openURL(url);
      })
      .finally(() => setBusy(false));
  };

  return { state, busy, problem, request, open };
}
