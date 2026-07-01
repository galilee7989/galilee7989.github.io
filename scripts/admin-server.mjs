// 加利利傳道會 — 本機後台管理（登入 / 禱告信 / 照片）
// 執行： node scripts/admin-server.mjs  或  雙擊「後台管理.bat」
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const dataPath = path.join(root, 'src', 'data', 'prayletters.json');
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
function ymKey(x) { const m = String(x.pdf || '').match(/(\d{4})(\d{2})\.pdf/); return m ? parseInt(m[1] + m[2], 10) : 0; }
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

    if (req.method === 'GET' && url === '/api/list') return send(res, 200, await readFile(dataPath, 'utf8'));
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
      const arr = JSON.parse(await readFile(dataPath, 'utf8'));
      const slug = `${y}-${m}`;
      const entry = { title: title && title.trim() ? title.trim() : `${y}年${m}月禱告信`, slug, date: `${y}-${m}-01T00:00:00`, pdf: `/prayletters/${y}/${pdfName}`, originalUrl: '' };
      const next = arr.filter((x) => x.slug !== slug); next.push(entry); next.sort((a, b) => ymKey(b) - ymKey(a));
      await writeFile(dataPath, JSON.stringify(next, null, 2) + '\n');
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
  console.log(' 預設密碼： ' + config.password + '（可在登入後修改）');
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
  .tabs{max-width:980px;margin:22px auto 0;padding:0 20px;display:flex;gap:10px}
  .tab{cursor:pointer;padding:10px 22px;border-radius:999px 999px 0 0;font-weight:700;background:#f0e9de;color:var(--muted);border:1px solid var(--line);border-bottom:none}
  .tab.active{background:#fff;color:var(--orange-deep)}
  .wrap{max-width:980px;margin:0 auto 40px;padding:0 20px}
  .pane{display:none;grid-template-columns:1fr 1fr;gap:24px}.pane.active{display:grid}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;box-shadow:0 10px 30px -20px rgba(80,45,12,.4)}
  h2{margin:0 0 4px;font-size:20px;font-weight:900}
  .hint{color:var(--muted);font-size:13px;margin:0 0 18px}
  .row{display:flex;gap:12px}.row>div{flex:1}
  .actions{margin-top:20px;display:flex;gap:12px;flex-wrap:wrap}
  .list{max-height:520px;overflow:auto;margin-top:8px}
  .item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px}
  .item b{font-weight:700;font-size:15px}.item a{color:var(--orange-deep);font-weight:700;font-size:13px;text-decoration:none}
  .count{color:var(--muted);font-size:13px;margin:0 0 10px}
  .ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-height:520px;overflow:auto;margin-top:8px}
  .gcell{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#f6f2ea}
  .gcell img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}
  .gcell .rm{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:8px;padding:4px 8px;font-size:12px;min-height:auto;cursor:pointer}
  @media(max-width:820px){.pane.active{grid-template-columns:1fr}}
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
      <h2>新增禱告信</h2><p class="hint">選擇 PDF、填年月即可。</p>
      <div class="row"><div><label>年份</label><input id="year" type="number" placeholder="2026" /></div><div><label>月份</label><select id="month"></select></div></div>
      <label>標題（留空自動產生）</label><input id="title" type="text" placeholder="2026年05月禱告信" />
      <label>PDF 檔案</label><input id="pdf" type="file" accept="application/pdf" />
      <div class="actions"><button class="primary" id="addBtn">新增禱告信</button><button class="ghost" id="buildBtn">重新建置網站</button></div>
      <div class="msg" id="msg"></div>
    </div>
    <div class="card"><h2>目前禱告信</h2><p class="count" id="count">載入中…</p><div class="list" id="list"></div></div>
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
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');$('pane-'+t.dataset.t).classList.add('active');
  }));
  const monthSel=$('month');for(let i=1;i<=12;i++){const v=String(i).padStart(2,'0');const o=document.createElement('option');o.value=v;o.textContent=v+' 月';monthSel.appendChild(o);}
  const now=new Date();$('year').value=now.getFullYear();monthSel.value=String(now.getMonth()+1).padStart(2,'0');
  const show=(el,k,t)=>{const m=$(el);m.className='msg '+k;m.textContent=t;};
  const toB64=(f)=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(f);});
  async function loadList(){const a=await(await fetch('/api/list')).json();$('count').textContent='共 '+a.length+' 篇';$('list').innerHTML=a.map(x=>'<div class="item"><b>'+x.title+'</b><a href="'+x.pdf+'" target="_blank">開啟 PDF</a></div>').join('');}
  async function loadGallery(){const a=await(await fetch('/api/gallery')).json();$('gcount').textContent='共 '+a.length+' 張';$('ggrid').innerHTML=a.map(x=>'<div class="gcell"><img src="'+x.src+'" alt=""><button class="rm" data-src="'+x.src+'">移除</button></div>').join('');document.querySelectorAll('.rm').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('從相簿移除這張照片？（檔案會保留）'))return;await fetch('/api/gallery/remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({src:b.dataset.src})});loadGallery();}));}
  loadList();loadGallery();
  $('addBtn').addEventListener('click',async()=>{const year=$('year').value.trim(),month=monthSel.value,title=$('title').value.trim(),file=$('pdf').files[0];if(!year)return show('msg','err','請輸入年份');if(!file)return show('msg','err','請選擇 PDF 檔');show('msg','info','上傳中…');try{const pdfBase64=await toB64(file);const r=await fetch('/api/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,month,title,pdfBase64})});const d=await r.json();if(!r.ok)return show('msg','err','失敗：'+(d.error||''));show('msg','ok','已新增「'+d.entry.title+'」。\\n請按「重新建置網站」更新顯示。');$('title').value='';$('pdf').value='';loadList();}catch(e){show('msg','err','錯誤：'+e.message);}});
  $('gAddBtn').addEventListener('click',async()=>{const alt=$('galt').value.trim(),file=$('gfile').files[0];if(!file)return show('gmsg','err','請選擇圖片檔');show('gmsg','info','上傳中…');try{const imageBase64=await toB64(file);const r=await fetch('/api/gallery/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alt,imageBase64})});const d=await r.json();if(!r.ok)return show('gmsg','err','失敗：'+(d.error||''));show('gmsg','ok','已新增照片。\\n請按「重新建置網站」更新顯示。');$('galt').value='';$('gfile').value='';loadGallery();}catch(e){show('gmsg','err','錯誤：'+e.message);}});
  async function build(elId){show(elId,'info','建置中，可能需要 10–30 秒…');try{const r=await fetch('/api/build',{method:'POST'});const d=await r.json();if(!r.ok)return show(elId,'err','建置失敗：\\n'+(d.error||''));show(elId,'ok','建置完成！網站已更新。');}catch(e){show(elId,'err','錯誤：'+e.message);}}
  $('buildBtn').addEventListener('click',()=>build('msg'));$('gBuildBtn').addEventListener('click',()=>build('gmsg'));
  $('savePwBtn').addEventListener('click',async()=>{const current=$('curpw').value,next=$('newpw').value;if(!current||!next)return show('pwmsg','err','請填寫欄位');show('pwmsg','info','儲存中…');try{const r=await fetch('/api/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current,next})});const d=await r.json();if(!r.ok)return show('pwmsg','err',d.error||'失敗');show('pwmsg','ok','密碼已更新。');$('curpw').value='';$('newpw').value='';}catch(e){show('pwmsg','err','錯誤：'+e.message);}});
  $('logoutBtn').addEventListener('click',async()=>{await fetch('/api/logout',{method:'POST'});location.reload();});
  $('pwBtn').addEventListener('click',()=>{document.querySelector('.tab[data-t=account]').click();});
</script>
</body></html>`;
