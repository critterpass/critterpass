/**
 * Records live API responses as test fixtures: with `CONTENT_FACTORY_RECORD=<dir>`, every request
 * the factory sends (model or search) is passed through to the real API and its response saved as
 * `<dir>/<name>.json` in the replay format the tests use.
 */
import path from 'node:path';

import { sha256Hex } from '@cp/content';

import { writeJson } from './work';

export function recordingFetch(dir: string, base: typeof fetch = fetch): typeof fetch {
  let count = 0;
  const recorder = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const response = await base(input, init);
    const text = await response.clone().text();
    const url = input instanceof Request ? input.url : String(input);
    count += 1;
    const requestBody = typeof init?.body === 'string' ? init.body : '';
    const name = `${String(count).padStart(3, '0')}-${sha256Hex(requestBody).slice(0, 10)}`;
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep the raw text
    }
    writeJson(path.join(dir, `${name}.json`), {
      source: `${new URL(url).host} ${new Date().toISOString().slice(0, 10)}`,
      request: requestBody === '' ? null : (JSON.parse(requestBody) as unknown),
      response: { status: response.status, body },
    });
    return response;
  };
  return recorder;
}
