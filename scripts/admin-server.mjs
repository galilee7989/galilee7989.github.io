// 加利利傳道會 — 本機後台管理（登入 / 禱告信 / 照片）
// 執行： node scripts/admin-server.mjs  或  雙擊「後台管理.bat」
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const praylettersDir = path.join(root, 'src', 'data', 'prayletters');
const galleryPath = path.join(root, 'src', 'data', 'gallery.json');
const configPath = path.join(root, 'scripts', 'admin-config.json');
const PORT = 4330;
const SALT = 'galilee-admin-v1';
const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function loadConfig() {
  if (!existsSync(configPath)) writeFileSync(configPath, JSON.stringify({ password: 'galilee2026' }, null, 2) + '\n');
  try { return JSON.parse(readFileSync(configPath, 'utf8')); } catch { return { password: 'galilee2026' }; }
}
let config = loadConfig();
const tokenFor = (pw) => crypto.createHash('sha256').update(SALT + ':' + pw).digest('hex');

function send(res, code, body, type = 'application/json', extraHeaders = {}) {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
const isAuthed = (req) => cookies(req).admin_token === tokenFor(config.password);
function ymKey(x) {
  const slugMatch = String(x.slug || '').match(/^(\d{4})-(\d{2})$/);
  if (slugMatch) return parseInt(slugMatch[1] + slugMatch[2], 10);
  const pdfMatch = String(x.pdf || '').match(/(\d{4})(\d{2})\.pdf/);
  return pdfMatch ? parseInt(pdfMatch[1] + pdfMatch[2], 10) : 0;
}
async function readPrayletters() {
  await mkdir(praylettersDir, { recursive: true });
  const files = (await readdir(praylettersDir)).filter((file) => file.endsWith('.json'));
  const items = [];
  for (const file of files) {
    const raw = await readFile(path.join(praylettersDir, file), 'utf8');
    items.push(JSON.parse(raw));
  }
  return items.sort((a, b) => ymKey(b) - ymKey(a));
}
async function writePrayletter(entry) {
  if (!/^\d{4}-\d{2}$/.test(entry.slug)) throw new Error('網址代碼格式需為 YYYY-MM');
  await mkdir(praylettersDir, { recursive: true });
  await writeFile(path.join(praylettersDir, `${entry.slug}.json`), JSON.stringify(entry, null, 2) + '\n');
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', (c) => { d += c; if (d.length > 30 * 1024 * 1024) { reject(new Error('檔案過大（上限 30MB）')); req.destroy(); } });
    req.on('end', () => resolve(d)); req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURI(req.url.split('?')[0]);
    const authed = isAuthed(req);

    // 首頁：未登入顯示登入頁，已登入顯示管理面板
    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      return send(res, 200, authed ? PAGE : LOGIN, 'text/html');
    }
    // 登入 / 登出
    if (req.method === 'POST' && url === '/api/login') {
      const { password } = JSON.parse(await readBody(req));
      if (password && password === config.password) {
        const cookie = `admin_token=${tokenFor(config.password)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`;
        return send(res, 200, JSON.stringify({ ok: true }), 'application/json', { 'Set-Cookie': cookie });
      }
      return send(res, 401, JSON.stringify({ error: '密碼錯誤' }));
    }
    if (req.method === 'POST' && url === '/api/logout') {
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json', { 'Set-Cookie': 'admin_token=; Path=/; Max-Age=0' });
    }

    // 靜態預覽 PDF / 圖片（公開內容）
    if (req.method === 'GET' && (url.startsWith('/prayletters/') || url.startsWith('/images/'))) {
      const f = path.join(root, 'public', url);
      if (existsSync(f) && statSync(f).isFile()) {
        const ext = path.extname(f).toLowerCase();
        const h = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
        if (ext === '.pdf') h['Content-Disposition'] = 'inline';
        res.writeHead(200, h);
        return createReadStream(f).pipe(res);
      }
      return send(res, 404, JSON.stringify({ error: '找不到檔案' }));
    }

    // 以下皆需登入
    if (url.startsWith('/api/') && !authed) return send(res, 401, JSON.stringify({ error: '未登入' }));

    if (req.method === 'GET' && url === '/api/list') return send(res, 200, JSON.stringify(await readPrayletters()));
    if (req.method === 'GET' && url === '/api/gallery') return send(res, 200, await readFile(galleryPath, 'utf8'));

    if (req.method === 'POST' && url === '/api/password') {
      const { current, next } = JSON.parse(await readBody(req));
      if (current !== config.password) return send(res, 401, JSON.stringify({ error: '目前密碼錯誤' }));
      if (!next || String(next).length < 4) return send(res, 400, JSON.stringify({ error: '新密碼至少 4 個字元' }));
      config.password = String(next);
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      const cookie = `admin_token=${tokenFor(config.password)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200`;
      return send(res, 200, JSON.stringify({ ok: true }), 'application/json', { 'Set-Cookie': cookie });
    }

    if (req.method === 'POST' && url === '/api/add') {
      const { year, month, title, pdfBase64 } = JSON.parse(await readBody(req));
      const y = String(year || '').trim(); const m = String(month || '').padStart(2, '0');
      if (!/^\d{4}$/.test(y)) return send(res, 400, JSON.stringify({ error: '年份需為 4 位數字' }));
      if (!/^(0[1-9]|1[0-2])$/.test(m)) return send(res, 400, JSON.stringify({ error: '月份需為 01–12' }));
      if (!pdfBase64) return send(res, 400, JSON.stringify({ error: '請選擇 PDF 檔' }));
      const dir = path.join(root, 'public', 'prayletters', y);
      await mkdir(dir, { recursive: true });
      const pdfName = `${y}${m}.pdf`;
      await writeFile(path.join(dir, pdfName), Buffer.from(String(pdfBase64).split(',').pop(), 'base64'));
      const slug = `${y}-${m}`;
      const entry = { title: title && title.trim() ? title.trim() : `${y}年${m}月禱告信`, slug, date: `${y}-${m}-01T00:00:00`, pdf: `/prayletters/${y}/${pdfName}`, originalUrl: '' };
      await writePrayletter(entry);
      const next = await readPrayletters();
      return send(res, 200, JSON.stringify({ ok: true, entry, count: next.length }));
    }

    if (req.method === 'POST' && url === '/api/gallery/add') {
      const { alt, imageBase64 } = JSON.parse(await readBody(req));
      if (!imageBase64) return send(res, 400, JSON.stringify({ error: '請選擇圖片檔' }));
      const head = String(imageBase64).slice(0, 40); let ext = '.jpg';
      if (head.includes('image/png')) ext = '.png';
      else if (head.includes('image/webp')) ext = '.webp';
      else if (head.includes('image/jpeg') || head.includes('image/jpg')) ext = '.jpg';
      else return send(res, 400, JSON.stringify({ error: '僅支援 JPG / PNG / WEBP' }));
      const dir = path.join(root, 'public', 'images', 'gallery');
      await mkdir(dir, { recursive: true });
      const name = 'g' + Date.now() + ext;
      await writeFile(path.join(dir, name), Buffer.from(String(imageBase64).split(',').pop(), 'base64'));
      const arr = JSON.parse(await readFile(galleryPath, 'utf8'));
      const item = { src: `/images/gallery/${name}`, alt: (alt && alt.trim()) || '加利利傳道會事工照片' };
      arr.unshift(item);
      await writeFile(galleryPath, JSON.stringify(arr, null, 2) + '\n');
      return send(res, 200, JSON.stringify({ ok: true, item, count: arr.length }));
    }

    if (req.method === 'POST' && url === '/api/gallery/remove') {
      const { src } = JSON.parse(await readBody(req));
      const arr = JSON.parse(await readFile(galleryPath, 'utf8'));
      const next = arr.filter((x) => x.src !== src);
      await writeFile(galleryPath, JSON.stringify(next, null, 2) + '\n');
      return send(res, 200, JSON.stringify({ ok: true, count: next.length }));
    }

    if (req.method === 'POST' && url === '/api/build') {
      exec('npm run build', { cwd: root, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
        if (err) return send(res, 500, JSON.stringify({ error: (stderr || err.message).slice(-1600) }));
        send(res, 200, JSON.stringify({ ok: true, log: String(stdout || '').slice(-1400) }));
      });
      return;
    }

    send(res, 404, JSON.stringify({ error: 'not found' }));
  } catch (e) { send(res, 500, JSON.stringify({ error: String((e && e.message) || e) })); }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('====================================');
  console.log(' 加利利傳道會 後台管理已啟動');
  console.log(' 請在瀏覽器開啟： http://127.0.0.1:' + PORT + '/');
  console.log(' 管理密碼： 已設定（可在登入後修改）');
  console.log(' 關閉：在此視窗按 Ctrl+C');
  console.log('====================================');
});

const STYLE = `<style>
  :root{--orange:#e35a0f;--orange-deep:#b8410a;--gold:#f4b43c;--ink:#2a2622;--muted:#7b736b;--line:#ece6dd;--soft:#faf6ef;}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;color:var(--ink);background:var(--soft);line-height:1.7}
  .top{height:4px;background:linear-gradient(90deg,var(--orange-deep),var(--orange),var(--gold))}
  header{background:#fff;border-bottom:1px solid var(--line);padding:16px 24px;display:flex;align-items:center;gap:14px}
  header .mark{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;color:#fff;font-weight:900;font-size:22px;background:linear-gradient(135deg,#ff7a29,var(--orange-deep))}
  header b{font-size:19px;letter-spacing:.05em}
  header small{display:block;color:var(--muted);font-size:12px;letter-spacing:.2em}
  header .sp{flex:1}
  .link{cursor:pointer;color:var(--orange-deep);font-weight:700;font-size:14px;background:none;border:none;padding:8px 12px;border-radius:8px}
  .link:hover{background:#fbeee4}
  input,select{width:100%;height:44px;padding:0 12px;border:1px solid var(--line);border-radius:10px;font:inherit;background:#fff}
  input[type=file]{padding:9px}
  button{cursor:pointer;border:none;border-radius:999px;font:inherit;font-weight:700;padding:12px 24px;min-height:46px}
  .primary{color:#fff;background:linear-gradient(135deg,#ff7a29,var(--orange-deep));box-shadow:0 14px 26px -14px rgba(227,90,15,.7)}
  .ghost{background:#fff;color:var(--orange-deep);border:2px solid var(--orange)}
  .msg{margin-top:16px;padding:12px 14px;border-radius:10px;font-size:14px;display:none;white-space:pre-wrap}
  .msg.ok{display:block;background:#eaf6ec;color:#1d6b32;border:1px solid #bfe3c6}
  .msg.err{display:block;background:#fdecea;color:#a3271f;border:1px solid #f3c2bd}
  .msg.info{display:block;background:#fff6e6;color:#8a5a10;border:1px solid #f2ddb0}
  label{display:block;font-weight:700;font-size:14px;margin:14px 0 6px}
</style>`;

const LOGIN = `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>登入｜加利利傳道會後台</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet" />
${STYLE}</head><body>
<div class="top"></div>
<div style="min-height:calc(100vh - 4px);display:grid;place-items:center;padding:20px">
  <div style="width:min(420px,100%);background:#fff;border:1px solid var(--line);border-radius:18px;padding:38px;box-shadow:0 20px 50px -30px rgba(80,45,12,.5)">
    <div style="text-align:center;margin-bottom:22px">
      <div style="width:60px;height:60px;margin:0 auto 12px;border-radius:16px;display:grid;place-items:center;color:#fff;font-weight:900;font-size:28px;background:linear-gradient(135deg,#ff7a29,var(--orange-deep))">加</div>
      <h1 style="margin:0;font-size:22px">後台管理登入</h1>
      <p style="margin:6px 0 0;color:var(--muted);font-size:14px">財團法人基督教加利利傳道會</p>
    </div>
    <label>密碼</label>
    <input id="pw" type="password" placeholder="請輸入管理密碼" autofocus />
    <button class="primary" id="loginBtn" style="width:100%;margin-top:20px">登入</button>
    <div class="msg" id="msg"></div>
  </div>
</div>
<script>
  const $=(id)=>document.getElementById(id);
  const show=(k,t)=>{const m=$('msg');m.className='msg '+k;m.textContent=t;};
  async function login(){
    const password=$('pw').value;
    if(!password)return show('err','請輸入密碼');
    show('info','登入中…');
    try{
      const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const d=await r.json();
      if(!r.ok)return show('err',d.error||'登入失敗');
      location.reload();
    }catch(e){show('err','錯誤：'+e.message);}
  }
  $('loginBtn').addEventListener('click',login);
  $('pw').addEventListener('keydown',(e)=>{if(e.key==='Enter')login();});
</script>
</body></html>`;

const PAGE = `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>後台管理｜加利利傳道會</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet" />
${STYLE}
<style>
  body{background:#f7f3ed}
  .tabs{max-width:1120px;margin:22px auto 0;padding:0 20px;display:flex;gap:8px;overflow:auto}
  .tab{cursor:pointer;padding:10px 20px;border-radius:999px;font-weight:900;background:#eee5d8;color:var(--muted);border:1px solid var(--line);white-space:nowrap}
  .tab.active{background:#fff;color:var(--orange-deep);box-shadow:0 10px 24px -20px rgba(80,45,12,.7)}
  .wrap{max-width:1120px;margin:18px auto 44px;padding:0 20px}
  .pane{display:none;gap:24px}.pane.active{display:grid}
  #pane-pray.pane.active{grid-template-columns:minmax(340px,.95fr) minmax(420px,1.25fr)}
  #pane-photo.pane.active,#pane-account.pane.active{grid-template-columns:1fr 1fr}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;box-shadow:0 14px 34px -26px rgba(80,45,12,.45)}
  .card.tight{padding:22px}
  h2{margin:0;font-size:20px;font-weight:900}
  .hint{color:var(--muted);font-size:13px;margin:6px 0 18px}
  .toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap}
  .pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fffaf4;color:var(--orange-deep);font-weight:900;font-size:13px;border-radius:999px;padding:7px 11px}
  .steps{display:grid;gap:10px;margin:18px 0}
  .step{display:grid;grid-template-columns:32px 1fr;gap:10px;align-items:start;padding:12px;border:1px solid #f0e2ce;background:#fffaf4;border-radius:12px}
  .step span{width:32px;height:32px;border-radius:999px;display:grid;place-items:center;background:var(--orange);color:#fff;font-weight:900}
  .step b{display:block;font-size:14px}.step small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .title-preview{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:#f7f3ed;border:1px dashed #dfcdb8;color:var(--ink);font-size:14px}
  .title-preview b{display:block;font-size:15px}
  .drop{display:block;margin-top:8px;border:2px dashed #dfcdb8;background:#fffaf4;border-radius:14px;padding:18px;text-align:center;cursor:pointer;transition:.16s ease}
  .drop:hover,.drop.has-file{border-color:var(--orange);background:#fff4e7}
  .drop strong{display:block;font-size:15px}.drop small{display:block;color:var(--muted);font-size:12px;margin-top:4px}
  .drop input{position:absolute;inline-size:1px;block-size:1px;opacity:0;pointer-events:none}
  .file-summary{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;background:#eef8f0;color:#1d6b32;font-size:13px}
  .file-summary.show{display:block}
  .warn{display:none;margin-top:12px;padding:10px 12px;border-radius:10px;background:#fff6e6;color:#8a5a10;border:1px solid #f2ddb0;font-size:13px}
  .warn.show{display:block}
  .actions{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
  .actions button{flex:1;min-width:160px}
  .count{color:var(--muted);font-size:13px;margin:0}
  .search{max-width:260px}
  .list{max-height:610px;overflow:auto;margin-top:8px;padding-right:2px}
  .item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 13px;border:1px solid var(--line);border-radius:12px;margin-bottom:9px;background:#fff}
  .item:hover{border-color:#dfcdb8;background:#fffdf9}
  .item b{font-weight:900;font-size:15px}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;color:var(--muted);font-size:12px}
  .item a{color:var(--orange-deep);font-weight:900;font-size:13px;text-decoration:none;border:1px solid #f0d5c3;border-radius:999px;padding:7px 10px;background:#fff7ef;white-space:nowrap}
  .empty{padding:22px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}
  .ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-height:520px;overflow:auto;margin-top:8px}
  .gcell{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#f6f2ea}
  .gcell img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
  .gcell .rm{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:8px;padding:4px 8px;font-size:12px;min-height:auto;cursor:pointer}
  @media(max-width:900px){#pane-pray.pane.active,#pane-photo.pane.active,#pane-account.pane.active{grid-template-columns:1fr}.search{max-width:none;width:100%}}
  @media(max-width:560px){.row{grid-template-columns:1fr}.card{padding:20px}.tabs{padding:0 14px}.wrap{padding:0 14px}.actions button{min-width:100%}}
</style></head><body>
<div class="top"></div>
<header>
  <div class="mark">加</div><div><b>後台管理</b><small>GALILEE ADMIN</small></div>
  <div class="sp"></div>
  <button class="link" id="pwBtn">修改密碼</button>
  <button class="link" id="logoutBtn">登出</button>
</header>
<div class="tabs">
  <div class="tab active" data-t="pray">禱告信</div>
  <div class="tab" data-t="photo">照片</div>
  <div class="tab" data-t="account">帳號</div>
</div>
<div class="wrap">
  <div class="pane active" id="pane-pray">
    <div class="card">
      <div class="toolbar">
        <div>
          <h2>每月新增禱告信</h2>
          <p class="hint">照著月份、檔案、發布三步驟走，新增後再重新建置網站。</p>
        </div>
        <span class="pill" id="nextHint">建議月份載入中</span>
      </div>
      <div class="steps">
        <div class="step"><span>1</span><div><b>確認月份</b><small>系統會依最新禱告信自動建議下一個月份。</small></div></div>
        <div class="step"><span>2</span><div><b>選擇 PDF</b><small>檔名可不同，上傳後會統一存成 YYYYMM.pdf。</small></div></div>
        <div class="step"><span>3</span><div><b>新增並建置</b><small>新增會更新資料；重新建置後本機網站才會顯示。</small></div></div>
      </div>
      <div class="row">
        <div><label>年份</label><input id="year" type="number" min="2000" max="2099" placeholder="2026" /></div>
        <div><label>月份</label><select id="month"></select></div>
      </div>
      <label>標題（通常不用改）</label><input id="title" type="text" placeholder="會自動產生，例如 2026年07月禱告信" />
      <div class="title-preview"><span>將新增為</span><b id="previewTitle">請選擇年月</b></div>
      <label>PDF 檔案</label>
      <label class="drop" id="drop">
        <input id="pdf" type="file" accept="application/pdf" />
        <strong id="dropTitle">點此選擇禱告信 PDF</strong>
        <small id="dropHelp">支援 PDF，單檔上限 30MB。</small>
      </label>
      <div class="file-summary" id="fileSummary"></div>
      <div class="warn" id="overwriteWarn"></div>
      <div class="actions"><button class="primary" id="addBtn">新增 / 更新禱告信</button><button class="ghost" id="buildBtn">重新建置網站</button></div>
      <div class="msg" id="msg"></div>
    </div>
    <div class="card tight">
      <div class="toolbar">
        <div><h2>目前禱告信</h2><p class="count" id="count">載入中…</p></div>
        <input class="search" id="letterSearch" type="search" placeholder="搜尋年份或標題" />
      </div>
      <div class="list" id="list"></div>
    </div>
  </div>
  <div class="pane" id="pane-photo">
    <div class="card">
      <h2>新增照片</h2><p class="hint">支援 JPG / PNG / WEBP。</p>
      <label>圖片說明（選填）</label><input id="galt" type="text" placeholder="例：受洗聚會合影" />
      <label>圖片檔案</label><input id="gfile" type="file" accept="image/*" />
      <div class="actions"><button class="primary" id="gAddBtn">新增照片</button><button class="ghost" id="gBuildBtn">重新建置網站</button></div>
      <div class="msg" id="gmsg"></div>
    </div>
    <div class="card"><h2>目前照片</h2><p class="count" id="gcount">載入中…</p><div class="ggrid" id="ggrid"></div></div>
  </div>
  <div class="pane" id="pane-account">
    <div class="card">
      <h2>修改密碼</h2><p class="hint">修改後會保存在 scripts/admin-config.json。</p>
      <label>目前密碼</label><input id="curpw" type="password" />
      <label>新密碼（至少 4 字元）</label><input id="newpw" type="password" />
      <div class="actions"><button class="primary" id="savePwBtn">儲存新密碼</button></div>
      <div class="msg" id="pwmsg"></div>
    </div>
    <div class="card"><h2>說明</h2><p class="hint">此後台只在本機（127.0.0.1）執行，不會對外公開。修改內容後，請按任一分頁的「重新建置網站」讓正式網站更新。</p></div>
  </div>
</div>
<script>
  const $=(id)=>document.getElementById(id);
  let letters=[];
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');$('pane-'+t.dataset.t).classList.add('active');
  }));
  const monthSel=$('month');for(let i=1;i<=12;i++){const v=String(i).padStart(2,'0');const o=document.createElement('option');o.value=v;o.textContent=v+' 月';monthSel.appendChild(o);}
  const now=new Date();$('year').value=now.getFullYear();monthSel.value=String(now.getMonth()+1).padStart(2,'0');
  const show=(el,k,t)=>{const m=$(el);m.className='msg '+k;m.textContent=t;};
  const toB64=(f)=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(f);});
  function esc(s){return String(s||'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function ymFromControls(){return {year:$('year').value.trim(),month:monthSel.value};}
  function defaultTitle(year,month){return year&&month ? year+'年'+month+'月禱告信' : '請選擇年月';}
  function monthFromSlug(x){const m=String(x.slug||'').match(/^(\\d{4})-(\\d{2})$/);return m ? Number(m[1]+m[2]) : 0;}
  function plusMonth(year,month){let y=Number(year),m=Number(month)+1;if(m>12){y+=1;m=1;}return {year:String(y),month:String(m).padStart(2,'0')};}
  function findExisting(){const ym=ymFromControls();const slug=ym.year+'-'+ym.month;return letters.find(x=>x.slug===slug);}
  function updatePreview(){
    const ym=ymFromControls();
    const title=$('title').value.trim()||defaultTitle(ym.year,ym.month);
    $('previewTitle').textContent=title;
    const hit=findExisting();
    $('overwriteWarn').className='warn'+(hit?' show':'');
    $('overwriteWarn').textContent=hit?'這個月份已存在：'+hit.title+'。新增會更新同一月份的資料與 PDF。':'';
  }
  function suggestNextMonth(){
    const latest=letters.slice().sort((a,b)=>monthFromSlug(b)-monthFromSlug(a))[0];
    if(!latest){$('nextHint').textContent='尚無資料';return;}
    const m=String(latest.slug||'').match(/^(\\d{4})-(\\d{2})$/);
    if(!m)return;
    const next=plusMonth(m[1],m[2]);
    $('year').value=next.year;monthSel.value=next.month;
    $('nextHint').textContent='建議新增 '+next.year+'年'+next.month+'月';
    updatePreview();
  }
  function renderList(){
    const q=$('letterSearch').value.trim().toLowerCase();
    const shown=letters.filter(x=>(x.title+' '+x.slug+' '+x.pdf).toLowerCase().includes(q)).slice(0,80);
    $('count').textContent='共 '+letters.length+' 篇'+(q?'，符合 '+shown.length+' 篇':'');
    if(!shown.length){$('list').innerHTML='<div class="empty">找不到符合的禱告信。</div>';return;}
    $('list').innerHTML=shown.map(x=>{
      const date=String(x.date||'').slice(0,10);
      return '<div class="item"><div><b>'+esc(x.title)+'</b><div class="meta"><span>'+esc(x.slug)+'</span><span>'+esc(date)+'</span><span>'+esc(x.pdf)+'</span></div></div><a href="'+esc(x.pdf)+'" target="_blank">開啟 PDF</a></div>';
    }).join('');
  }
  async function loadList(){letters=await(await fetch('/api/list')).json();letters.sort((a,b)=>monthFromSlug(b)-monthFromSlug(a));renderList();suggestNextMonth();}
  async function loadGallery(){const a=await(await fetch('/api/gallery')).json();$('gcount').textContent='共 '+a.length+' 張';$('ggrid').innerHTML=a.map(x=>'<div class="gcell"><img src="'+x.src+'" alt=""><button class="rm" data-src="'+x.src+'">移除</button></div>').join('');document.querySelectorAll('.rm').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('從相簿移除這張照片？（檔案會保留）'))return;await fetch('/api/gallery/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src:b.dataset.src})});loadGallery();}));}
  loadList();loadGallery();
  ['year','title'].forEach(id=>$(id).addEventListener('input',updatePreview));monthSel.addEventListener('change',updatePreview);$('letterSearch').addEventListener('input',renderList);
  $('pdf').addEventListener('change',()=>{const file=$('pdf').files[0];const drop=$('drop');if(!file){drop.className='drop';$('fileSummary').className='file-summary';$('dropTitle').textContent='點此選擇禱告信 PDF';return;}drop.className='drop has-file';$('dropTitle').textContent=file.name;$('fileSummary').className='file-summary show';$('fileSummary').textContent='已選擇：'+file.name+'（'+Math.round(file.size/1024)+' KB）';});
  $('addBtn').addEventListener('click',async()=>{const year=$('year').value.trim(),month=monthSel.value,title=$('title').value.trim(),file=$('pdf').files[0];if(!/^\\d{4}$/.test(year))return show('msg','err','請輸入 4 位數年份');if(!file)return show('msg','err','請選擇 PDF 檔');if(file.type&&file.type!=='application/pdf')return show('msg','err','請選擇 PDF 檔');show('msg','info','上傳中，請稍候…');try{const pdfBase64=await toB64(file);const r=await fetch('/api/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,month,title,pdfBase64})});const d=await r.json();if(!r.ok)return show('msg','err','失敗：'+(d.error||''));show('msg','ok','已新增「'+d.entry.title+'」。\\n下一步：按「重新建置網站」更新本機頁面，再 commit + push 上線。');$('title').value='';$('pdf').value='';$('drop').className='drop';$('dropTitle').textContent='點此選擇禱告信 PDF';$('fileSummary').className='file-summary';await loadList();}catch(e){show('msg','err','錯誤：'+e.message);}});
  $('gAddBtn').addEventListener('click',async()=>{const alt=$('galt').value.trim(),file=$('gfile').files[0];if(!file)return show('gmsg','err','請選擇圖片檔');show('gmsg','info','上傳中…');try{const imageBase64=await toB64(file);const r=await fetch('/api/gallery/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alt,imageBase64})});const d=await r.json();if(!r.ok)return show('gmsg','err','失敗：'+(d.error||''));show('gmsg','ok','已新增照片。\\n請按「重新建置網站」更新顯示。');$('galt').value='';$('gfile').value='';loadGallery();}catch(e){show('gmsg','err','錯誤：'+e.message);}});
  async function build(elId){show(elId,'info','建置中，可能需要 10–30 秒…');try{const r=await fetch('/api/build',{method:'POST'});const d=await r.json();if(!r.ok)return show(elId,'err','建置失敗：\\n'+(d.error||''));show(elId,'ok','建置完成！網站已更新。');}catch(e){show(elId,'err','錯誤：'+e.message);}}
  $('buildBtn').addEventListener('click',()=>build('msg'));$('gBuildBtn').addEventListener('click',()=>build('gmsg'));
  $('savePwBtn').addEventListener('click',async()=>{const current=$('curpw').value,next=$('newpw').value;if(!current||!next)return show('pwmsg','err','請填寫欄位');show('pwmsg','info','儲存中…');try{const r=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current,next})});const d=await r.json();if(!r.ok)return show('pwmsg','err',d.error||'失敗');show('pwmsg','ok','密碼已更新。');$('curpw').value='';$('newpw').value='';}catch(e){show('pwmsg','err','錯誤：'+e.message);}});
  $('logoutBtn').addEventListener('click',async()=>{await fetch('/api/logout',{method:'POST'});location.reload();});
  $('pwBtn').addEventListener('click',()=>{document.querySelector('.tab[data-t=account]').click();});
</script>
</body></html>`;
