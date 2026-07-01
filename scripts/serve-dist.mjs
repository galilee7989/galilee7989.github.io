import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createServer } from 'node:http';

const root = join(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4322);

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath)) {
    filePath = join(root, safePath, 'index.html');
  }

  return filePath;
}

createServer((req, res) => {
  const filePath = resolvePath(req.url ?? '/');

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const stat = statSync(filePath);
  const headers = {
    'content-type': types[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    'accept-ranges': 'bytes',
  };
  if (ext === '.html') headers['cache-control'] = 'no-cache';
  // 讓 PDF 在瀏覽器內直接顯示，而非觸發下載
  if (ext === '.pdf') {
    headers['content-disposition'] = 'inline';
    headers['x-content-type-options'] = 'nosniff';
  }
  res.writeHead(200, headers);

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`Serving dist at http://127.0.0.1:${port}/`);
});
