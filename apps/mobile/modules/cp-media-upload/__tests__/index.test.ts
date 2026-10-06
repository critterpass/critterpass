jest.mock('../src/CpMediaUploadModule', () => ({
  nativeCpMediaUploadModule: { enqueue: jest.fn(), retry: jest.fn() },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { completedParts, enqueueUpload, partRanges, retryUpload } from '../index';
import { nativeCpMediaUploadModule } from '../src/CpMediaUploadModule';

/** The OS transfer service is the boundary: background sessions cannot run under Jest. */
const native = nativeCpMediaUploadModule as unknown as {
  readonly enqueue: jest.Mock<(request: unknown) => Promise<void>>;
  readonly retry: jest.Mock<(id: string, urls: Record<string, string>) => Promise<void>>;
};

describe('cp-media-upload', () => {
  it('splits a file into contiguous parts with the remainder last', () => {
    const parts = partRanges(12_582_912 + 7, 5_242_880);
    expect(parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    expect(parts.reduce((sum, part) => sum + part.length, 0)).toBe(12_582_919);
    expect(parts[2]).toEqual({ partNumber: 3, offset: 10_485_760, length: 2_097_159 });
    expect(partRanges(10, 5_242_880)).toEqual([{ partNumber: 1, offset: 0, length: 10 }]);
  });

  it('refuses an empty upload before it reaches the native queue', async () => {
    await expect(
      enqueueUpload({ id: 'p', filePath: '/f', contentType: 'image/jpeg', parts: [] }),
    ).rejects.toThrow();
    expect(native.enqueue).not.toHaveBeenCalled();
  });

  it('completes only when every part has its ETag', () => {
    const upload = {
      id: 'p',
      state: 'uploading' as const,
      filePath: '/f',
      sentBytes: 5,
      totalBytes: 10,
      parts: [
        { partNumber: 1, state: 'done' as const, etag: '"a"' },
        { partNumber: 2, state: 'uploading' as const },
      ],
    };
    expect(completedParts(upload)).toBeNull();
    expect(
      completedParts({
        ...upload,
        parts: [upload.parts[0]!, { partNumber: 2, state: 'done', etag: '"b"' }],
      }),
    ).toEqual([
      { part_number: 1, etag: '"a"' },
      { part_number: 2, etag: '"b"' },
    ]);
  });

  it('passes re-presigned URLs keyed by part number', async () => {
    native.retry.mockResolvedValue(undefined);
    await retryUpload('p', { 2: 'https://r2/2' });
    expect(native.retry).toHaveBeenCalledWith('p', { '2': 'https://r2/2' });
  });
});
