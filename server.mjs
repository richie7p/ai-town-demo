// Local static server for the demo. It listens on 127.0.0.1 only and serves an
// explicit allowlist: the page, its modules under src/, two vendored Phaser
// files and one image. Everything else (repository files, .env, node_modules,
// exported runs) answers 404.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC_FILES = new Set([
  '/index.html',
  '/styles.css',
  '/app.js',
  '/favicon.svg',
  '/assets/town-grand-v1.png',
]);
/** Browser module paths: src/name.js or src/ui/name.js (lower-case letters and dashes only). */
const MODULE_PATH = /^\/src\/(?:ui\/)?[a-z-]+\.js$/;
const VENDOR_FILES = new Map([
  ['/vendor/phaser.js', 'node_modules/phaser/dist/phaser.min.js'],
  ['/vendor/phaser.LICENSE.txt', 'node_modules/phaser/LICENSE.md'],
]);
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
};

/** The file on disk for a request path, or null when it is not public. */
function resolvePublicFile(path) {
  if (path === '/') path = '/index.html';
  if (VENDOR_FILES.has(path)) return { path, file: VENDOR_FILES.get(path) };
  if (PUBLIC_FILES.has(path) || MODULE_PATH.test(path)) return { path, file: path };
  return null;
}

function reply(res, status, body) {
  res.writeHead(status);
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405);
  let requested;
  try {
    requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return reply(res, 400, 'Bad request');
  }
  const target = resolvePublicFile(requested);
  if (!target) return reply(res, 404, 'Not found');
  try {
    const body = await readFile(join(root, target.file));
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(target.path)] || 'application/octet-stream',
      ...SECURITY_HEADERS,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    reply(res, 404, 'Not found');
  }
});

server.on('error', error => {
  console.error(
    error.code === 'EADDRINUSE' ? `連接埠 ${port} 已使用，請設定 PORT 後再啟動。` : error.message,
  );
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () =>
  console.log(`AI 小鎮 demo：http://127.0.0.1:${server.address().port}\n僅限本機；Ctrl+C 停止。`),
);
