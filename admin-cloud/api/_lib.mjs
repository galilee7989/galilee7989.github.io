import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ONE_DAY = 60 * 60 * 24;
const COOKIE_NAME = 'galilee_admin';
// 雲端平台的請求上限約 4.5MB；本機預覽也提前擋下，錯誤訊息才會一致
const MAX_BODY_BYTES = 4_500_000;
const MAX_LOGIN_FAILURES = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export const config = {
  owner: process.env.GITHUB_OWNER || 'galilee7989',
  repo: process.env.GITHUB_REPO || 'galilee7989.github.io',
  branch: process.env.GITHUB_BRANCH || 'main',
};

export function isCloud() {
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

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        done = true;
        chunks.length = 0;
        const error = new Error('檔案太大，超過雲端後台上限。請先把 PDF 壓縮到 3MB 以內，或改用本機後台。');
        error.status = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      // 先收集成 Buffer 再解碼：逐塊轉字串會弄壞跨區塊的中文字
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

export async function readJsonBody(req) {
  const text = await readRawBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('請求內容不是有效的 JSON。');
    error.status = 400;
    throw error;
  }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i <= 0) return;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // 編碼不合法的 cookie 視同不存在
    }
  });
  return out;
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (value) return value;
  if (!isCloud()) return process.env.ADMIN_PASSWORD || 'local-dev-session-secret';
  // 正式環境寧可拒絕服務，也不退回任何寫死的字串
  throw new Error('ADMIN_SESSION_SECRET 未設定：請到 Vercel 環境變數補上後重新部署。');
}

function secretKey() {
  return Buffer.from(secret(), 'utf8');
}

export function sessionSecretWeak() {
  return secret().length < 32;
}

// 正式環境設定不全時，任何 API 都先拋錯：寧可拒絕服務，也不要帶病運作
export function assertConfigured() {
  secretKey();
}

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || '';
}

export function verifyPassword(candidate, actual) {
  const digest = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();
  return crypto.timingSafeEqual(digest(candidate), digest(actual));
}

export function clientIp(req) {
  // 這兩個 header 由平台寫入；不採信用戶端可自行夾帶的 x-forwarded-for
  const platform = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'];
  if (typeof platform === 'string' && platform.trim()) return platform.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// 記在函式執行個體的記憶體裡，雲端上只能盡力而為；真正的防線是夠長的隨機密碼
export function createLoginThrottle({
  maxFailures = MAX_LOGIN_FAILURES,
  windowMs = LOGIN_WINDOW_MS,
  lockMs = LOGIN_LOCK_MS,
} = {}) {
  const failures = new Map();

  return {
    lockedFor(ip) {
      const record = failures.get(ip);
      return record ? Math.max(0, record.lockedUntil - Date.now()) : 0;
    },
    recordFailure(ip) {
      const now = Date.now();
      for (const [key, record] of failures) {
        if (now - record.firstAt > windowMs && record.lockedUntil <= now) failures.delete(key);
      }
      let record = failures.get(ip);
      if (!record || now - record.firstAt > windowMs) {
        record = { count: 0, firstAt: now, lockedUntil: 0 };
        failures.set(ip, record);
      }
      record.count += 1;
      if (record.count >= maxFailures) {
        record.lockedUntil = now + lockMs;
        record.count = 0;
        record.firstAt = now;
      }
    },
    clear(ip) {
      failures.delete(ip);
    },
  };
}

export const loginThrottle = createLoginThrottle();

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
  let authed = false;
  try {
    assertConfigured();
    authed = isAuthed(req);
  } catch (error) {
    json(res, 500, { error: error.message });
    return false;
  }
  if (authed) return true;
  json(res, 401, { error: '未登入' });
  return false;
}

export function decodePdf(base64) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-' ? buffer : null;
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
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  if (!token) throw new Error('GITHUB_TOKEN 未設定');
  if (!/^[\x20-\x7E]+$/.test(token)) {
    throw new Error('GITHUB_TOKEN 格式錯誤，請重新貼 GitHub 產生的 token，不要包含中文或說明文字');
  }
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      'user-agent': 'galilee-admin-cloud',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const message = data.message || `GitHub API ${res.status}`;
    const friendly = res.status === 401 || res.status === 403 ? 'GITHUB_TOKEN 無效或權限不足' : null;
    const error = new Error(friendly ? `${friendly}（GitHub：${message}）` : message);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function githubPathExists(pathname) {
  // 只用來決定 commit 訊息寫「新增」還是「更新」；查不出來就當作不存在，不影響發布
  try {
    await github('GET', `/repos/${config.owner}/${config.repo}/contents/${pathname}?ref=${config.branch}`);
    return true;
  } catch {
    return false;
  }
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
  const [exists, ref] = await Promise.all([
    githubPathExists(jsonPath),
    github('GET', `/repos/${config.owner}/${config.repo}/git/ref/heads/${config.branch}`),
  ]);
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
    message: `${exists ? '更新' : '新增'} ${entry.title}`,
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
