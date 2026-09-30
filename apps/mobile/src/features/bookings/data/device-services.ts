/**
 * The device's wallet services: the api over HTTPS with the session headers, document uploads
 * through the presign route (purpose `booking_doc`), documents cached under the app's own
 * `bookings/` folder for airplane mode, the clipboard and links.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, wire values and HTTP verbs, never copy. */
import * as Clipboard from 'expo-clipboard';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Linking } from 'react-native';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { BookingsServices, DocumentReader, HttpOutcome } from './services';

const FOLDER = 'bookings';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function codeOf(body: unknown, status: number): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : `HTTP_${String(status)}`;
}

async function request<T>(path: string, init: RequestInit): Promise<HttpOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(await sessionHeaders()),
      },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return { kind: 'error', code: codeOf(body, response.status) };
  return { kind: 'ok', value: body as T };
}

async function uploadDoc(uri: string, contentType: string): Promise<HttpOutcome<string>> {
  let bytes: Uint8Array;
  try {
    bytes = await new File(uri).bytes();
  } catch {
    return { kind: 'error', code: 'UNREADABLE_FILE' };
  }
  const sha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
  const presign = await request<{
    media_key?: string;
    put_url?: string;
    headers?: Record<string, string>;
  }>('/v1/media/presign', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'booking_doc',
      content_type: contentType,
      bytes: bytes.byteLength,
      sha256,
    }),
  });
  if (presign.kind !== 'ok') return presign;
  const { media_key: mediaKey, put_url: putUrl, headers } = presign.value;
  if (mediaKey === undefined || putUrl === undefined) return { kind: 'error', code: 'PRESIGN' };
  const status = await new Promise<number | null>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', putUrl);
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send(bytes);
  });
  if (status === null) return { kind: 'offline' };
  if (status < 200 || status >= 300) return { kind: 'error', code: `PUT_${String(status)}` };
  return { kind: 'ok', value: mediaKey };
}

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function download(url: string, name: string): Promise<string | null> {
  try {
    const target = new File(folder(), name);
    if (target.exists) return target.uri;
    const file = await File.downloadFileAsync(url, target, { idempotent: true });
    return file.uri;
  } catch {
    return null;
  }
}

export function deviceBookingsServices(ocr: DocumentReader | null): BookingsServices {
  return {
    ocr,
    getJson: (path) => request<unknown>(path, { method: 'GET' }),
    uploadDoc,
    download,
    copy: async (text) => {
      await Clipboard.setStringAsync(text);
    },
    readClipboard: async () => {
      try {
        return await Clipboard.getStringAsync();
      } catch {
        return '';
      }
    },
    openUrl: async (url) => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
    },
    now: () => Date.now(),
  };
}
