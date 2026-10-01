import { describe, expect, it } from 'vitest';

import { baseImages, imagesIn, isPulled, testImages } from './test-images';

describe('the images CI pulls before the database suites', () => {
  it('reads image constants and container literals, not other strings', () => {
    const source = [
      "const S3_IMAGE = 'rustfs/rustfs:1.0.0';",
      "export const REDIS_TEST_IMAGE = 'redis:8.8.3-alpine';",
      "await new GenericContainer('centrifugo/centrifugo:v6.9.6').start();",
      'new GenericContainer(S3_IMAGE)',
      "const url = 'redis://127.0.0.1:6379';",
    ].join('\n');
    expect(imagesIn(source)).toEqual([
      'rustfs/rustfs:1.0.0',
      'redis:8.8.3-alpine',
      'centrifugo/centrifugo:v6.9.6',
    ]);
  });

  it('reads the base of a Dockerfile, past any FROM flags', () => {
    expect(baseImages('# syntax\nFROM pgvector/pgvector:0.8.6-pg18-trixie\nRUN true\n')).toEqual([
      'pgvector/pgvector:0.8.6-pg18-trixie',
    ]);
    expect(baseImages('FROM --platform=linux/amd64 node:26-slim AS build\n')).toEqual([
      'node:26-slim',
    ]);
  });

  it('leaves out the image the suites build themselves', () => {
    expect(isPulled('critterpass-postgres:test')).toBe(false);
    expect(isPulled('redis:8.8.3-alpine')).toBe(true);
  });

  it('covers every image the suites start today', () => {
    const images = testImages();
    for (const image of [
      'pgvector/pgvector:0.8.6-pg18-trixie',
      'redis:8.8.3-alpine',
      'centrifugo/centrifugo:v6.9.6',
      'rustfs/rustfs:1.0.0',
    ]) {
      expect(images).toContain(image);
    }
    expect(images.some((image) => image.startsWith('testcontainers/ryuk:'))).toBe(true);
    expect(images.some((image) => image.startsWith('critterpass-'))).toBe(false);
  });
});
