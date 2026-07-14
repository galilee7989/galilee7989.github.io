import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 8787);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
};

async function runApi(req, res, pathname) {
  const name = pathname.replace(/^\/api\//, '') || 'session';
  const file = path.join(root, 'api', `${name}.mjs`);
  if (!existsSync(file)) return false;
  const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
  await mod.default(req, res);
  return true;
}

function sendStatic(req, res, pathname) {
  let file = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(publicDir) || !existsSync(file) || statSync(file).isDirectory()) {
    file = path.join(publicDir, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': types[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
  });
  createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (pathname.startsWith('/api/') && await runApi(req, res, pathname)) return;
    sendStatic(req, res, decodeURIComponent(pathname));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error.message }));
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Galilee cloud admin dev server: http://127.0.0.1:${port}/`);
});
