/** The PhotoDNA Match adapter against its response fixtures: hit, miss, and a refused image. */
import { describe, expect, it } from 'vitest';

import { PHOTODNA_MATCH_URL, photoDnaMatcher } from '../../../src/jobs/avatar/hash-match';
import { replay } from './replay';

const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('photoDnaMatcher', () => {
  it('sends the image inline with the subscription key and reports a hit', async () => {
    const transport = replay('photodna-match');
    const matcher = photoDnaMatcher({ apiKey: 'test-key', fetch: transport.fetch });
    expect(await matcher.match(IMAGE)).toEqual({ hit: true, reference: 'WUS_fixture_match' });
    const [request] = transport.requests;
    expect(request?.url).toBe(PHOTODNA_MATCH_URL);
    expect(request?.headers.get('Ocp-Apim-Subscription-Key')).toBe('test-key');
    expect(request?.body).toEqual({
      DataRepresentation: 'inline',
      Value: Buffer.from(IMAGE).toString('base64'),
    });
  });

  it('reports a miss', async () => {
    const matcher = photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-no-match').fetch });
    expect((await matcher.match(IMAGE)).hit).toBe(false);
  });

  it('throws on any status but OK, so an unscanned photo is retried, never passed', async () => {
    const matcher = photoDnaMatcher({ apiKey: 'k', fetch: replay('photodna-error').fetch });
    await expect(matcher.match(IMAGE)).rejects.toThrow(/status 3208/);
  });
});
