/**
 * The device's day bundle services: the api over HTTPS with the session headers, and files under
 * the app's own `trip-days/<trip>/` folder (app sandbox; on iOS the default data protection keeps
 * them readable after the first unlock, which a pre-dawn alarm needs).
 */
/* eslint-disable lingui/no-unlocalized-strings -- folder names, HTTP verbs and header names. */
import { Directory, File, Paths } from 'expo-file-system';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { HttpOutcome, TripDayServices } from './services';

const ROOT = 'trip-days';

function codeOf(body: unknown, status: number): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : `HTTP_${String(status)}`;
}

async function getJson(path: string): Promise<HttpOutcome<unknown>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return { kind: 'error', code: codeOf(body, response.status) };
  return { kind: 'ok', value: body };
}

function folder(name: string, create: boolean): Directory {
  const dir = new Directory(Paths.document, ROOT, name);
  if (create && !dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function bytesIn(dir: Directory): number {
  if (!dir.exists) return 0;
  let total = 0;
  for (const entry of dir.list()) {
    total += entry instanceof Directory ? bytesIn(entry) : (entry.size ?? 0);
  }
  return total;
}

export function deviceTripDayServices(): TripDayServices {
  return {
    getJson,
    download: async (url, name, file) => {
      try {
        const target = new File(folder(name, true), file);
        if (target.exists) return target.uri;
        return (await File.downloadFileAsync(url, target, { idempotent: true })).uri;
      } catch {
        return null;
      }
    },
    exists: (uri) => {
      try {
        return new File(uri).exists;
      } catch {
        return false;
      }
    },
    removeFolder: (name) => {
      const dir = folder(name, false);
      if (dir.exists) dir.delete();
    },
    folderBytes: (name) => bytesIn(folder(name, false)),
    freeBytes: () => {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return null;
      }
    },
    now: () => Date.now(),
  };
}
