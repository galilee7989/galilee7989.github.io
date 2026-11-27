const app = document.getElementById('app');

let state = {
  authed: false,
  env: {},
  warnings: [],
  items: [],
  pdfFile: null,
  busy: false,
};

const MAX_PDF_BYTES = 3 * 1024 * 1024;
const SITE_URL = 'https://galilee.org.tw';

// 平台層的錯誤（檔案太大、逾時等）回的不是 JSON，要另外處理，否則只會看到「not valid JSON」
function httpError(res) {
  if (res.status === 413) return new Error('檔案太大，超過雲端後台上限。請先把 PDF 壓縮到 3MB 以內，或改用本機後台。');
  if (res.status === 429) return new Error('操作太過頻繁，請稍後再試。');
  return new Error(`請求失敗（HTTP ${res.status}）`);
}

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) throw data.error ? new Error(data.error) : httpError(res);
  return data;
};

function plusMonth(slug) {
  const match = String(slug || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  let y = match ? Number(match[1]) : now.getFullYear();
  let m = match ? Number(match[2]) + 1 : now.getMonth() + 1;
  if (m > 12) { y += 1; m = 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

function titleFromSlug(slug) {
  const [year, month] = slug.split('-');
  return `${year}年${month}月禱告信`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-shell">
      <section class="login-card">
        <div class="brand">
          <div class="brand-mark">加</div>
          <div><strong>加利利傳道會</strong><span>GALILEE CLOUD ADMIN</span></div>
        </div>
        <h1 style="font-size:26px;margin:28px 0 6px">雲端後台登入</h1>
        <p class="sub">登入後可新增每月禱告信，系統會自動發布到 GitHub。</p>
        <form id="loginForm" style="margin-top:22px">
          <div class="field">
            <label for="password">管理密碼</label>
            <input class="control" id="password" type="password" autocomplete="current-password" autofocus />
          </div>
          <button class="primary" type="submit">登入</button>
          <div class="notice" id="loginMsg"></div>
        </form>
      </section>
    </main>`;
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.getElementById('loginMsg');
    msg.className = 'notice show info';
    msg.textContent = '登入中...';
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: document.getElementById('password').value }) });
      await boot();
    } catch (error) {
      msg.className = 'notice show err';
      msg.textContent = error.message;
    }
  });
}

function envRows() {
  return Object.entries(state.env).map(([key, value]) => (
    `<span><em>${key}</em><b class="${value ? 'ok' : 'bad'}">${value ? '已設定' : '未設定'}</b></span>`
  )).join('');
}

function warningRows() {
  return state.warnings.includes('weak_session_secret')
    ? '<p class="env-warn">ADMIN_SESSION_SECRET 偏短，建議換成 32 字元以上的隨機字串。</p>'
    : '';
}

function renderApp() {
  const latest = state.items[0];
  const nextSlug = plusMonth(latest?.slug);
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">加</div>
          <div><strong>雲端後台</strong><span>GALILEE ADMIN</span></div>
        </div>
        <nav class="nav">
          <button class="active">禱告信發布</button>
          <button disabled>照片管理</button>
          <button disabled>設定</button>
        </nav>
        <div class="sidebar-foot">
          <div class="env-list">${envRows()}</div>
          ${warningRows()}
          <button class="ghost" id="logoutBtn">登出</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1>禱告信發布中心</h1>
            <p class="sub">新增 PDF 後會自動寫入 GitHub，正式網站會接著自動重建。</p>
          </div>
          <button class="ghost" id="refreshBtn">重新整理</button>
        </header>
        <section class="dashboard">
          <form class="panel" id="publishForm">
            <div class="panel-head">
              <div><h2>新增本月禱告信</h2><p class="sub">系統已依最新資料建議下一個月份。</p></div>
              <span class="chip">建議 ${nextSlug}</span>
            </div>
            <div class="field">
              <label for="slug">月份代碼</label>
              <input class="control" id="slug" value="${nextSlug}" pattern="\\d{4}-(0[1-9]|1[0-2])" />
              <small>格式固定為 YYYY-MM，例如 2026-07。</small>
            </div>
            <div class="field">
              <label for="title">標題</label>
              <input class="control" id="title" value="${titleFromSlug(nextSlug)}" />
            </div>
            <div class="field">
              <label for="pagePreview">發布後的網頁</label>
              <input class="control" id="pagePreview" readonly />
            </div>
            <div class="field">
              <label for="pathPreview">PDF 路徑</label>
              <input class="control" id="pathPreview" readonly />
            </div>
            <div class="field">
              <label for="pdf">PDF 檔案</label>
              <div class="drop" id="drop">
                <input id="pdf" type="file" accept="application/pdf" />
                <p id="fileName">選擇每月禱告信 PDF</p>
              </div>
            </div>
            <div class="notice" id="formMsg"></div>
            <button class="primary" id="publishBtn" type="submit">發布到正式網站</button>
          </form>
          <section class="panel">
            <div class="panel-head">
              <div><h2>最新禱告信</h2><p class="sub">共 ${state.items.length} 篇，最新月份在最上方。</p></div>
              <div class="tools"><input class="control search" id="search" placeholder="搜尋月份或標題" /></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>月份</th><th>標題</th><th>日期</th><th>PDF</th><th>操作</th></tr></thead>
                <tbody id="rows"></tbody>
              </table>
            </div>
            <div class="activity" id="activity"><b>狀態</b> 等待發布。</div>
          </section>
        </section>
      </main>
    </div>`;
  bindApp();
  renderRows('');
  updatePathPreview();
}

function renderRows(query) {
  const q = query.trim().toLowerCase();
  const rows = state.items
    .filter((item) => `${item.slug} ${item.title} ${item.pdf}`.toLowerCase().includes(q))
    .slice(0, 80)
    .map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.slug)}</strong></td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(String(item.date).slice(0, 10))}</td>
        <td><a class="link" href="${escapeHtml(item.pdf)}" target="_blank" rel="noopener">開啟 PDF</a></td>
        <td><button class="ghost useItem" data-slug="${escapeHtml(item.slug)}" type="button">沿用</button></td>
      </tr>`).join('');
  document.getElementById('rows').innerHTML = rows || `<tr><td colspan="5">找不到資料。</td></tr>`;
  document.querySelectorAll('.useItem').forEach((button) => button.addEventListener('click', () => {
    const item = state.items.find((x) => x.slug === button.dataset.slug);
    if (!item) return;
    document.getElementById('slug').value = item.slug;
    document.getElementById('title').value = item.title;
    updatePathPreview();
    showForm('info', '已帶入既有月份。若發布，會覆蓋同月份 JSON 與 PDF。');
  }));
}

function showForm(type, text) {
  const msg = document.getElementById('formMsg');
  msg.className = `notice show ${type}`;
  msg.textContent = text;
}

function updatePathPreview() {
  const slug = document.getElementById('slug').value.trim();
  const [year, month] = slug.split('-');
  const valid = /^\d{4}$/.test(year) && /^\d{2}$/.test(month);
  document.getElementById('pathPreview').value = valid ? `/prayletters/${year}/${year}${month}.pdf` : '';
  document.getElementById('pagePreview').value = valid ? `${SITE_URL}/prayletter/${slug}/` : '';
  if (!document.getElementById('title').dataset.touched) document.getElementById('title').value = titleFromSlug(slug);
  const exists = state.items.find((item) => item.slug === slug);
  if (exists) showForm('info', `注意：${slug} 已存在。發布會更新「${exists.title}」。`);
}

function bindApp() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    await boot();
  });
  document.getElementById('refreshBtn').addEventListener('click', loadItems);
  document.getElementById('search').addEventListener('input', (event) => renderRows(event.target.value));
  document.getElementById('slug').addEventListener('input', updatePathPreview);
  document.getElementById('title').addEventListener('input', (event) => { event.target.dataset.touched = '1'; });
  document.getElementById('pdf').addEventListener('change', (event) => {
    state.pdfFile = event.target.files[0] || null;
    document.getElementById('drop').classList.toggle('has-file', Boolean(state.pdfFile));
    document.getElementById('fileName').textContent = state.pdfFile
      ? `${state.pdfFile.name} (${Math.round(state.pdfFile.size / 1024)} KB)${state.pdfFile.size > MAX_PDF_BYTES ? ' — 超過 3MB 上限' : ''}`
      : '選擇每月禱告信 PDF';
  });
  document.getElementById('publishForm').addEventListener('submit', publish);
}

async function publish(event) {
  event.preventDefault();
  if (state.busy) return;
  if (!state.pdfFile) return showForm('err', '請先選擇 PDF 檔案。');
  if (state.pdfFile.size > MAX_PDF_BYTES) {
    return showForm('err', `PDF 太大（${(state.pdfFile.size / 1024 / 1024).toFixed(1)} MB），雲端後台上限為 3MB。請先壓縮後再上傳，或改用本機後台。`);
  }
  const slug = document.getElementById('slug').value.trim();
  const existing = state.items.find((item) => item.slug === slug);
  if (existing && !window.confirm(`${slug} 已存在（${existing.title}）。\n確定要用新的 PDF 覆蓋這個月份嗎？`)) return;
  state.busy = true;
  document.getElementById('publishBtn').disabled = true;
  showForm('info', '正在上傳並建立 GitHub commit...');
  try {
    const result = await api('/api/publish', {
      method: 'POST',
      body: JSON.stringify({
        slug,
        title: document.getElementById('title').value,
        pdfBase64: await fileToBase64(state.pdfFile),
      }),
    });
    let success = `已發布 ${result.entry.title}\nCommit: ${result.commitSha}\n網站約 1～2 分鐘後更新。`;
    showForm('ok', success);
    state.pdfFile = null;
    // loadItems() 會重繪整個畫面，成功訊息要補回來才看得到
    try {
      await loadItems();
    } catch {
      success += '\n（清單更新失敗，請按「重新整理」；發布本身已成功。）';
    }
    showForm('ok', success);
  } catch (error) {
    showForm('err', error.message);
  } finally {
    state.busy = false;
    document.getElementById('publishBtn').disabled = false;
  }
}

async function loadItems() {
  const data = await api('/api/prayletters');
  state.items = data.items || [];
  renderApp();
}

async function boot() {
  const session = await api('/api/session');
  state.authed = session.authenticated;
  state.env = session.env || {};
  state.warnings = session.warnings || [];
  if (!state.authed) return renderLogin();
  if (!state.env.GITHUB_TOKEN) {
    state.items = [];
    renderApp();
    showForm('err', 'GITHUB_TOKEN 未設定：請先到 Vercel Production 新增 GitHub token，才能讀取與發布禱告信。');
    document.getElementById('activity').innerHTML = '<b>待設定</b> GITHUB_TOKEN 未設定。';
    return;
  }
  await loadItems();
}

boot().catch((error) => {
  app.innerHTML = `<main class="login-shell"><section class="login-card"><h1>後台載入失敗</h1><p>${escapeHtml(error.message)}</p></section></main>`;
});
