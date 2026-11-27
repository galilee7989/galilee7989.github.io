// 改完必跑的驗證：建置（含禱告信資料驗證）→ 檢查清單頁與首頁的新舊順序 → 核對輸出的 PDF
// 執行：npm run verify
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = path.join(root, 'dist');

function fail(message) {
  console.error(`\n✘ ${message}`);
  process.exit(1);
}

function listHtmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listHtmlFiles(full) : entry.name.endsWith('.html') ? [full] : [];
  });
}

// 依檔名（YYYY-MM）由新到舊，這就是網站應該呈現的順序
const dataDir = path.join(root, 'src', 'data', 'prayletters');
const months = readdirSync(dataDir).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\.json$/, '')).sort().reverse();
if (!months.length) fail(`在 ${dataDir} 找不到任何禱告信 JSON。`);
const letters = months.map((month) => {
  try {
    return { month, ...JSON.parse(readFileSync(path.join(dataDir, `${month}.json`), 'utf8')) };
  } catch {
    fail(`${month}.json 不是有效的 JSON，請修正後再試。`);
  }
});
console.log(`① 禱告信資料：${letters.length} 篇（${months.at(-1)} ～ ${months[0]}）`);

console.log('② 建置網站（會一併驗證每篇的檔名、slug 與 PDF）…');
const astro = path.join(root, 'node_modules', 'astro', 'bin', 'astro.mjs');
if (!existsSync(astro)) fail('找不到 astro，請先執行 npm install。');
try {
  execFileSync(process.execPath, [astro, 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });
} catch {
  fail('建置失敗。請看上面的錯誤訊息，它會指名是哪一個檔案的問題；修正後再執行一次。');
}

const pages = listHtmlFiles(dist).length;
console.log(`③ 建置成功：${pages} 頁`);

const slugsInListPage = [...new Set([...readFileSync(path.join(dist, 'prayletter', 'index.html'), 'utf8').matchAll(/href="\/prayletter\/(\d{4}-\d{2})\/"/g)].map((match) => match[1]))];
if (JSON.stringify(slugsInListPage) !== JSON.stringify(months)) {
  fail(`清單頁順序不正確：最前面是 ${slugsInListPage[0] ?? '（無）'}，應該是 ${months[0]}。`);
}
console.log(`④ 清單頁順序：正確（最前面 ${slugsInListPage[0]}，共 ${slugsInListPage.length} 篇）`);

const home = readFileSync(path.join(dist, 'index.html'), 'utf8');
const latest = letters[0];
if ((home.match(/href="\/prayletter\/(\d{4}-\d{2})\/"/) || [])[1] !== latest.month || !home.includes(`${latest.title}已公佈`)) {
  fail(`首頁的「最新禱告信」不是 ${latest.month}（${latest.title}）。`);
}
console.log(`⑤ 首頁最新一篇：${latest.title}`);

const missing = letters.filter((letter) => !existsSync(path.join(dist, letter.pdf || '')));
if (missing.length) fail(`有 ${missing.length} 篇的 PDF 沒有輸出到 dist：${missing.map((letter) => letter.month).join('、')}`);
console.log(`⑥ PDF：${letters.length} 個皆已輸出`);

console.log('\n✔ 本機驗證全部通過。推送後請再到線上確認：https://galilee.org.tw/prayletter/');
