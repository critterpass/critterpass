/**
 * Uploads a drawn signature: `POST /v1/media/presign {purpose: signature}` for the stroke JSON,
 * then the signed PUT; the presign's `media_id` is what `save_signature` takes. Null when anything
 * fails (no signal, refused), and the sheet says so; nothing is half-saved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths, purposes and headers, never copy. */
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { encodeStroke, STROKE_MAX_BYTES, type SignatureStroke } from './stroke';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadStroke(stroke: SignatureStroke): Promise<string | null> {
  const bytes = new Uint8Array(encodeStroke(stroke));
  if (bytes.byteLength > STROKE_MAX_BYTES) return null;
  try {
    const sha256 = hex(await digest(CryptoDigestAlgorithm.SHA256, bytes.buffer));
    const presign = await fetch(`${resolveApiBaseUrl()}/v1/media/presign`, {
      method: 'POST',
      headers: {
        ...(await sessionHeaders()),
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        purpose: 'signature',
        content_type: 'application/json',
        bytes: bytes.byteLength,
        sha256,
      }),
    });
    if (!presign.ok) return null;
    const body = (await presign.json()) as {
      media_id?: string;
      put_url?: string;
      headers?: Record<string, string>;
    };
    if (body.media_id === undefined || body.put_url === undefined) return null;
    const put = await fetch(body.put_url, {
      method: 'PUT',
      headers: body.headers ?? {},
      body: bytes.buffer,
    });
    return put.ok ? body.media_id : null;
  } catch {
    return null;
  }
}
