/**
 * The device's money services: the api over HTTPS with the session cookie (receipt upload, payout
 * reveal), the photo library through expo-image-picker (guarded, so a build without it degrades),
 * the clipboard and links. Payout details stay in memory: nothing here writes them to disk.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes, wire values and HTTP verbs, never copy. */
import type { RevealedPayoutMethod } from '@cp/domain';
import { requireOptionalNativeModule } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File } from 'expo-file-system';
import type * as ImagePickerModule from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { HttpOutcome, MoneyServices, PickOutcome, ReceiptReader } from './services';

/**
 * Receipt photos are JPEGs from the scanner or the picker; the api caps them at 10 MB. On Android
 * the picker hands the photo back as it is: its re-encoding step fails to start in the app's
 * Android build (`ExceptionInInitializerError`), which left PICK A PHOTO unable to return anything.
 */
const RECEIPT_QUALITY = Platform.OS === 'android' ? 1 : 0.8;

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

function imagePicker(): typeof ImagePickerModule | null {
  if (requireOptionalNativeModule('ExponentImagePicker') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-image-picker') as typeof ImagePickerModule;
}

async function pickPhoto(): Promise<PickOutcome> {
  const picker = imagePicker();
  if (picker === null) return { kind: 'failed' };
  try {
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: RECEIPT_QUALITY,
      exif: false,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    return asset === undefined ? { kind: 'cancelled' } : { kind: 'picked', uri: asset.uri };
  } catch (error) {
    // The picker needs no permission: a throw is the picker failing, not a refusal.
    console.warn('[receipt-scan] photo picker', error);
    return { kind: 'failed' };
  }
}

async function uploadReceiptPhoto(uri: string): Promise<HttpOutcome<string>> {
  let bytes: Uint8Array;
  try {
    bytes = await new File(uri).bytes();
  } catch {
    return { kind: 'error', code: 'UNREADABLE_PHOTO' };
  }
  const sha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
  const presign = await request<{
    media_key?: string;
    put_url?: string;
    headers?: Record<string, string>;
  }>('/v1/media/presign', {
    method: 'POST',
    body: JSON.stringify({
      purpose: 'receipt',
      content_type: 'image/jpeg',
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

export function deviceMoneyServices(reader: ReceiptReader | null): MoneyServices {
  return {
    reader,
    pickPhoto,
    uploadReceiptPhoto,
    postReceipt: (body) =>
      request<{ status: string }>('/v1/receipts', { method: 'POST', body: JSON.stringify(body) }),
    revealPayout: async (paymentId) => {
      const outcome = await request<{ methods: RevealedPayoutMethod[] }>(
        `/v1/payments/${encodeURIComponent(paymentId)}/payout`,
        { method: 'GET' },
      );
      return outcome.kind === 'ok' ? { kind: 'ok', value: outcome.value.methods } : outcome;
    },
    myPayoutMethods: async () => {
      const outcome = await request<{ methods: RevealedPayoutMethod[] }>('/v1/me/payout-methods', {
        method: 'GET',
      });
      return outcome.kind === 'ok' ? { kind: 'ok', value: outcome.value.methods } : outcome;
    },
    openUrl: async (url) => {
      try {
        await Linking.openURL(url);
        return true;
      } catch {
        return false;
      }
    },
    copy: async (text) => {
      await Clipboard.setStringAsync(text);
    },
  };
}
