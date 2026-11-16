import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { SessionError } from './llm-sessions.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const publicFiles = new Set(['/index.html', '/styles.css', '/app.js', '/favicon.svg', '/assets/town-grand-v1.png', '/assets/furniture-atlas-v0.8.png']);
const vendorFiles = new Map([['/vendor/phaser.js', 'node_modules/phaser/dist/phaser.min.js'], ['/vendor/phaser.LICENSE.txt', 'node_modules/phaser/LICENSE.md']]);
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'same-origin' };
function json(res, status, value) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new SessionError('json_required', '請使用 JSON 格式。', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new SessionError('body_too_large', '請求超過長度上限。', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new SessionError('invalid_json', '請求格式無法讀取。', 400); }
}
function localRequest(req) {
  const port = req.socket.localPort;
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return false;
  if (req.method === 'POST' && req.headers['x-town-request'] !== '1') return false;
  return true;
}
export function createLocalServer({ root, sessions }) {
  return createServer(async (req, res) => {
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400, headers); res.end('Bad request'); return; }
    if (path.startsWith('/api/')) {
      if (!localRequest(req)) { json(res, 403, { error: 'local_only', message: '這個操作只接受本機小鎮頁面的請求。' }); return; }
      try {
        if (path === '/api/status' && req.method === 'GET') { json(res, 200, sessions.status()); return; }
        if (path === '/api/llm/runs' && req.method === 'POST') { json(res, 201, sessions.create(await readJson(req))); return; }
        const match = path.match(/^\/api\/llm\/runs\/([a-f0-9-]{36})(\/step|\/progress)?$/);
        if (match) {
          const [, id, action] = match;
          if (req.method === 'GET' && action === '/progress') { json(res, 200, sessions.progress(id)); return; }
          if (req.method === 'GET' && !action) { json(res, 200, sessions.snapshot(sessions.get(id))); return; }
          if (req.method === 'POST' && action === '/step') { const data = await readJson(req); json(res, 200, await sessions.advance(id, data.expectedTick)); return; }
        }
        json(res, 404, { error: 'not_found', message: '找不到這個操作。' });
      } catch (error) {
        // Never pass upstream bodies, request headers, env or arbitrary errors to the browser.
        json(res, error instanceof SessionError ? error.status : 400, { error: error.code || 'invalid_request', message: error instanceof SessionError ? error.message : '場次設定無效，請檢查種子與設備數量。' });
      }
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, headers); res.end(); return; }
    if (path === '/') path = '/index.html';
    if (!(publicFiles.has(path) || vendorFiles.has(path) || /^\/src\/[a-z-]+\.js$/.test(path))) { res.writeHead(404, headers); res.end('Not found'); return; }
    try {
      const body = await readFile(join(root, vendorFiles.get(path) || path));
      res.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404, headers); res.end('Not found'); }
  });
}
