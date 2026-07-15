import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ONE_DAY = 60 * 60 * 24;
const COOKIE_NAME = 'galilee_admin';

export const config = {
  owner: process.env.GITHUB_OWNER || 'galilee7989',
  repo: process.env.GITHUB_REPO || 'galilee7989.github.io',
  branch: process.env.GITHUB_BRANCH || 'main',
};

function isCloud() {
  return Boolean(process.env.VERCEL || process.env.CF_PAGES || process.env.NODE_ENV === 'production');
}

function localRepoRoot() {
  if (process.env.LOCAL_REPO_ROOT) return process.env.LOCAL_REPO_ROOT;
  if (existsSync(path.join(process.cwd(), 'src', 'data'))) return process.cwd();
  return path.resolve(process.cwd(), '..');
}

export function json(res, code, body, headers = {}) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  if (!data) return {};
  return JSON.parse(data);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'local-dev-session-secret';
}

function secretKey() {
  return Buffer.from(secret(), 'utf8');
}

export function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return isCloud() ? '' : 'galilee2026';
}

export function signSession() {
  const exp = Math.floor(Date.now() / 1000) + ONE_DAY;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function isAuthed(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(value) {
  const secure = isCloud() ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_DAY}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function envStatus() {
  return {
    ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD) || !isCloud(),
    ADMIN_SESSION_SECRET: Boolean(process.env.ADMIN_SESSION_SECRET) || !isCloud(),
    GITHUB_TOKEN: Boolean(process.env.GITHUB_TOKEN),
    GITHUB_OWNER: Boolean(process.env.GITHUB_OWNER) || Boolean(config.owner),
    GITHUB_REPO: Boolean(process.env.GITHUB_REPO) || Boolean(config.repo),
    GITHUB_BRANCH: Boolean(process.env.GITHUB_BRANCH) || Boolean(config.branch),
  };
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  json(res, 401, { error: '未登入' });
  return false;
}

function monthKey(item) {
  const match = String(item.slug || '').match(/^(\d{4})-(\d{2})$/);
  return match ? Number(`${match[1]}${match[2]}`) : 0;
}

export async function listLocalPrayletters() {
  const dir = path.join(localRepoRoot(), 'src', 'data', 'prayletters');
  const files = (await readdir(dir)).filter((file) => file.endsWith('.json'));
  const items = [];
  for (const file of files) items.push(JSON.parse(await readFile(path.join(dir, file), 'utf8')));
  return items.sort((a, b) => monthKey(b) - monthKey(a));
}

export async function writeLocalPrayletter({ entry, pdfBase64 }) {
  const [year, month] = entry.slug.split('-');
  const pdfName = `${year}${month}.pdf`;
  const root = localRepoRoot();
  const pdfDir = path.join(root, 'public', 'prayletters', year);
  await mkdir(pdfDir, { recursive: true });
  await writeFile(path.join(pdfDir, pdfName), Buffer.from(pdfBase64, 'base64'));
  const dataDir = path.join(root, 'src', 'data', 'prayletters');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, `${entry.slug}.json`), JSON.stringify(entry, null, 2) + '\n');
  return { mode: 'local', commitSha: 'local-file-write' };
}

async function github(method, urlPath, body) {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN 未設定');
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      'user-agent': 'galilee-admin-cloud',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

export async function listGithubPrayletters() {
  const tree = await github('GET', `/repos/${config.owner}/${config.repo}/git/trees/${config.branch}?recursive=1`);
  const files = tree.tree
    .filter((item) => item.type === 'blob' && item.path.startsWith('src/data/prayletters/') && item.path.endsWith('.json'))
    .map((item) => item.path);
  const items = await Promise.all(files.map(async (file) => {
    const raw = await fetch(`https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${file}`);
    if (!raw.ok) throw new Error(`無法讀取 ${file}`);
    return raw.json();
  }));
  return items.sort((a, b) => monthKey(b) - monthKey(a));
}

export async function commitGithubPrayletter({ entry, pdfBase64 }) {
  const [year, month] = entry.slug.split('-');
  const pdfName = `${year}${month}.pdf`;
  const pdfPath = `public/prayletters/${year}/${pdfName}`;
  const jsonPath = `src/data/prayletters/${entry.slug}.json`;
  const ref = await github('GET', `/repos/${config.owner}/${config.repo}/git/ref/heads/${config.branch}`);
  const baseSha = ref.object.sha;
  const [pdfBlob, jsonBlob] = await Promise.all([
    github('POST', `/repos/${config.owner}/${config.repo}/git/blobs`, { content: pdfBase64, encoding: 'base64' }),
    github('POST', `/repos/${config.owner}/${config.repo}/git/blobs`, { content: JSON.stringify(entry, null, 2) + '\n', encoding: 'utf-8' }),
  ]);
  const tree = await github('POST', `/repos/${config.owner}/${config.repo}/git/trees`, {
    base_tree: baseSha,
    tree: [
      { path: pdfPath, mode: '100644', type: 'blob', sha: pdfBlob.sha },
      { path: jsonPath, mode: '100644', type: 'blob', sha: jsonBlob.sha },
    ],
  });
  const commit = await github('POST', `/repos/${config.owner}/${config.repo}/git/commits`, {
    message: `新增 ${entry.title}`,
    tree: tree.sha,
    parents: [baseSha],
    author: {
      name: process.env.GITHUB_AUTHOR_NAME || 'Galilee Admin',
      email: process.env.GITHUB_AUTHOR_EMAIL || 'admin@galilee.org.tw',
    },
  });
  await github('PATCH', `/repos/${config.owner}/${config.repo}/git/refs/heads/${config.branch}`, {
    sha: commit.sha,
  });
  return { mode: 'github', commitSha: commit.sha, commitUrl: commit.html_url };
}

export async function listPrayletters() {
  if (process.env.GITHUB_TOKEN) return listGithubPrayletters();
  const dir = path.join(localRepoRoot(), 'src', 'data', 'prayletters');
  if (existsSync(dir)) return listLocalPrayletters();
  throw new Error('GITHUB_TOKEN 未設定');
}

export async function publishPrayletter({ entry, pdfBase64 }) {
  if (process.env.GITHUB_TOKEN) return commitGithubPrayletter({ entry, pdfBase64 });
  if (!isCloud()) return writeLocalPrayletter({ entry, pdfBase64 });
  throw new Error('GITHUB_TOKEN 未設定');
}
