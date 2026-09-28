import { describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import {
  uploadAvatar,
  type AvatarUploadOutcome,
  type PhotoServices,
  type PresignHttp,
  type PreparedAvatar,
  type TakePhotoOutcome,
} from '../photo/photo-pipeline';
import { useRealPhoto } from '../photo/use-real-photo';

const PREPARED: PreparedAvatar = {
  uri: 'file:///avatar.png',
  bytes: new Uint8Array([1, 2, 3]),
  sha256: 'a'.repeat(64),
  cutout: true,
};

/** The recorded `POST /v1/media/presign` answers (docs/api-contracts.md §5.4). */
function presignHttp(
  answer: { status: number; body: unknown },
  putStatus = 200,
): PresignHttp & {
  calls: unknown[];
} {
  const calls: unknown[] = [];
  return {
    calls,
    postJson: (path, body) => {
      calls.push([path, body]);
      return Promise.resolve(answer);
    },
    put: (_url, _headers, _bytes, onProgress) => {
      onProgress(0.5);
      return Promise.resolve(putStatus);
    },
  };
}

describe('uploadAvatar', () => {
  it('presigns an avatar PNG and puts the bytes', async () => {
    const http = presignHttp({
      status: 200,
      body: {
        media_key: 'u/0192/avatar/0193',
        put_url: 'https://r2.example/put',
        headers: { 'content-type': 'image/png' },
        expires_at: '2026-09-28T10:00:00.000Z',
      },
    });
    const progress: number[] = [];
    const outcome = await uploadAvatar(http, PREPARED, (p) => progress.push(p));
    expect(outcome).toEqual({ kind: 'uploaded', mediaKey: 'u/0192/avatar/0193' });
    expect(http.calls[0]).toEqual([
      '/v1/media/presign',
      { purpose: 'avatar', content_type: 'image/png', bytes: 3, sha256: PREPARED.sha256 },
    ]);
    expect(progress).toEqual([0.5, 1]);
  });

  it('surfaces the avatar upload limit', async () => {
    const http = presignHttp({
      status: 429,
      body: {
        error: {
          code: 'RATE_LIMITED',
          message: 'slow down',
          retryable: true,
          detail: { retry_after_s: 1800 },
        },
      },
    });
    expect(await uploadAvatar(http, PREPARED, () => undefined)).toEqual({
      kind: 'rate_limited',
      retryAfterS: 1800,
    });
  });

  it('reports offline when the presign cannot be reached', async () => {
    const http: PresignHttp = {
      postJson: () => Promise.reject(new Error('Network request failed')),
      put: () => Promise.resolve(200),
    };
    expect(await uploadAvatar(http, PREPARED, () => undefined)).toEqual({ kind: 'offline' });
  });
});

function photos(opts: {
  lifted?: boolean;
  take?: TakePhotoOutcome;
  upload?: AvatarUploadOutcome;
}): PhotoServices {
  return {
    picker: {
      pickFromLibrary: () => Promise.resolve({ uri: 'file:///pick.jpg', width: 800, height: 800 }),
      takePhoto: () => Promise.resolve(opts.take ?? { kind: 'cancelled' }),
    },
    lift: {
      lift: (uri) => Promise.resolve(opts.lifted === false ? null : { uri: `${uri}.cutout.png` }),
    },
    prepare: (uri, lifted) => Promise.resolve({ ...PREPARED, uri, cutout: lifted }),
    upload: (_prepared, onProgress) => {
      onProgress(0.4);
      return Promise.resolve(opts.upload ?? { kind: 'uploaded', mediaKey: 'u/1/avatar/2' });
    },
  };
}

describe('the real-photo flow', () => {
  it('lifts the subject, previews it and uploads it', async () => {
    const uploaded: unknown[] = [];
    const { result } = await renderHook(() =>
      useRealPhoto({
        photos: photos({}),
        requestCamera: () => Promise.resolve({ result: 'granted', report: {} as never }),
        onUploaded: (r) => uploaded.push(r),
      }),
    );
    await act(() => result.current.fromLibrary());
    expect(result.current.state).toMatchObject({
      kind: 'preview',
      lifted: true,
      uri: 'file:///pick.jpg.cutout.png',
    });
    await act(async () => {
      result.current.setZoom(1.5);
      await Promise.resolve();
    });
    expect(result.current.state).toMatchObject({ zoom: 1.5 });
    await act(async () => {
      result.current.confirm();
      await Promise.resolve();
    });
    expect(result.current.state).toMatchObject({
      kind: 'done',
      mediaKey: 'u/1/avatar/2',
      cutout: true,
    });
    expect(uploaded).toHaveLength(1);
  });

  it('falls back to a circle crop when no one is found', async () => {
    const { result } = await renderHook(() =>
      useRealPhoto({
        photos: photos({ lifted: false }),
        requestCamera: () => Promise.resolve({ result: 'granted', report: {} as never }),
        onUploaded: () => undefined,
      }),
    );
    await act(() => result.current.fromLibrary());
    expect(result.current.state).toMatchObject({
      kind: 'preview',
      lifted: false,
      uri: 'file:///pick.jpg',
    });
  });

  it('lands on camera denied when the OS refuses', async () => {
    const { result } = await renderHook(() =>
      useRealPhoto({
        photos: photos({}),
        requestCamera: () => Promise.resolve({ result: 'denied', report: {} as never }),
        onUploaded: () => undefined,
      }),
    );
    await act(() => result.current.fromCamera());
    expect(result.current.state).toEqual({ kind: 'camera_denied' });
  });

  it('shows the rate limit and an offline failure', async () => {
    for (const [upload, expected] of [
      [
        { kind: 'rate_limited', retryAfterS: 600 },
        { kind: 'rate_limited', retryAfterS: 600 },
      ],
      [{ kind: 'offline' }, { kind: 'failed', offline: true }],
    ] as const) {
      const { result } = await renderHook(() =>
        useRealPhoto({
          photos: photos({ upload }),
          requestCamera: () => Promise.resolve({ result: 'granted', report: {} as never }),
          onUploaded: () => undefined,
        }),
      );
      await act(() => result.current.fromLibrary());
      await act(async () => {
        result.current.confirm();
        await Promise.resolve();
      });
      expect(result.current.state).toEqual(expected);
    }
  });
});
