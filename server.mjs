import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const publicFiles = new Set(['/index.html', '/styles.css', '/app.js', '/favicon.svg', '/assets/town-grand-v1.png']);
const vendorFiles = new Map([
  ['/vendor/phaser.js', 'node_modules/phaser/dist/phaser.min.js'],
  ['/vendor/phaser.LICENSE.txt', 'node_modules/phaser/LICENSE.md'],
]);
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end('Bad request'); return; }
  if (path === '/') path = '/index.html';
  if (!(publicFiles.has(path) || vendorFiles.has(path) || /^\/src\/[a-z-]+\.js$/.test(path))) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(join(root, vendorFiles.get(path) || path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `連接埠 ${port} 已使用，請設定 PORT 後再啟動。` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`AI 小鎮 demo：http://127.0.0.1:${server.address().port}\n僅限本機；Ctrl+C 停止。`));
