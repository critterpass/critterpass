// Serves the read-only design/ folder over HTTP so Chromium can load the .dc.html files and their scripts.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const designDir = path.join(repoRoot, 'design');
export const rendersDir = path.join(repoRoot, 'docs/design-renders');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Starts a static server on an ephemeral port; resolves with its origin and a close function. */
export function serveDesign() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const filePath = path.join(designDir, pathname);
    if (!filePath.startsWith(designDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const type = contentTypes[path.extname(filePath)] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

/** File name used for a screen's PNG, derived from its data-screen-label. */
export const screenFileName = (label) => `${label.replace(/[^a-zA-Z0-9-]+/g, '_')}.png`;
