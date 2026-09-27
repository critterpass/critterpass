import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, logRedactPaths } from '../../src/obs/logger';

describe('api logger', () => {
  it('redacts base keys and privacy-registry columns at depth', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString('utf8'));
        callback();
      },
    });
    const logger = createLogger({ level: 'info', service: 'api', commit: 'test', destination });
    logger.info(
      { req_id: 'r1', email: 'anna@example.com', user: { phone: '+84 90 123 4567' }, op_id: 'o1' },
      'request',
    );
    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record).toMatchObject({
      service: 'api',
      commit: 'test',
      req_id: 'r1',
      op_id: 'o1',
      email: '[redacted]',
      user: { phone: '[redacted]' },
    });
    expect(logRedactPaths()).toEqual(expect.arrayContaining(['authorization', '*.budget_max']));
  });
});
