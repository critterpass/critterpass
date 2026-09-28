/**
 * Link previews: every public page carries what WhatsApp, iMessage, Slack and X read to unfurl a
 * link (og:title, og:description, og:image, twitter:card), and its card image loads. Runs against
 * the local build by default and against a deployed site with `UNFURL_BASE_URL` (the web workflow
 * does this after every staging deploy). Card images are fetched from the host under test.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const BASE = process.env['UNFURL_BASE_URL'];
const INVITE = process.env['UNFURL_INVITE_CODE'] ?? (BASE === undefined ? 'SANDY4' : undefined);

const PAGES = [
  '/tips',
  '/tips/how-to-get-six-friends-to-agree',
  '/tips/planning',
  '/legal',
  '/legal/privacy',
  '/legal/terms/1.0.0',
  '/r',
  '/j',
  ...(BASE === undefined ? ['/', '/r/WYNST8'] : ['/']),
  ...(INVITE === undefined ? [] : [`/i/${INVITE}`]),
];

function url(path: string): string {
  return BASE === undefined ? path : new URL(path, BASE).toString();
}

/** Meta tags by `property` or `name`, the way link-preview crawlers read the raw HTML. */
function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const match of html.matchAll(/<meta\s+([^>]+?)\/?>/gu)) {
    const attributes = match[1] ?? '';
    const key = /(?:property|name)="([^"]+)"/u.exec(attributes)?.[1];
    const content = /content="([^"]*)"/u.exec(attributes)?.[1];
    if (key !== undefined && content !== undefined && !tags.has(key)) tags.set(key, content);
  }
  return tags;
}

async function checkCard(request: APIRequestContext, image: string): Promise<void> {
  const response = await request.get(url(new URL(image).pathname));
  expect(response.status(), image).toBe(200);
  expect(response.headers()['content-type'], image).toMatch(/^image\/(png|jpeg|webp)/u);
  expect((await response.body()).byteLength, image).toBeLessThan(300 * 1024);
}

test.describe('link previews', () => {
  for (const path of PAGES) {
    test(`${path} unfurls`, async ({ request }) => {
      const response = await request.get(url(path), {
        headers: { 'user-agent': 'WhatsApp/2.24 (link preview check)' },
      });
      expect(response.status()).toBe(200);
      const tags = metaTags(await response.text());
      for (const key of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) {
        expect(tags.get(key), `${path} ${key}`).toBeTruthy();
      }
      expect(tags.get('twitter:card')).toBe('summary_large_image');
      await checkCard(request, tags.get('og:image') ?? '');
    });
  }
});
