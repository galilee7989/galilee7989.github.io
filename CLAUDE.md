# CLAUDE.md — 專案給 AI 助理的說明

這份是給協助維護本專案的 AI（Claude Code / Cowork 等）看的技術索引。人類操作步驟見 `使用手冊.md`，歷史與決策見 `PROJECT_NOTES.md`。

## 專案概要

- 財團法人基督教加利利傳道會官網。**Astro 靜態網站** → 建置後部署到 **GitHub Pages**。
- 正式網址：https://galilee.org.tw （自訂網域，已啟用 HTTPS；www 自動轉址）。
- Repo：`galilee7989/galilee7989.github.io`（公開的 user site）。
- 正本永遠是 GitHub；本機資料夾只是工作副本，壞了就 `git clone` 重抓。

## 建置與部署

- 本機：`npm install` → `npm run build`（輸出到 `dist/`）。本機預覽 `node scripts/serve-dist.mjs` 或 `start-galilee.bat`（埠 48732）/ `一鍵啟動.bat`。
- 上線：push 到 `main` → `.github/workflows/deploy.yml`（`withastro/action@v3`）自動建置部署。
- **重要：workflow 必須指定 `node-version: 22`**（Astro 7 不支援 Node 20，否則 build 失敗）。
- 自訂網域：`public/CNAME` = `galilee.org.tw`；TWNIC DNS 設 A 記錄 185.199.108–111.153 + `www` CNAME → `galilee7989.github.io`。

## 資料模型

- **禱告信**：collection，每月一檔 `src/data/prayletters/<YYYY-MM>.json`，欄位 `{ title, slug, date, pdf, originalUrl? }`。
  - 由 `src/data/prayletters.ts` 用 `import.meta.glob('./prayletters/*.json')` 載入；`sortPrayletters()` 依 `date` 由新到舊排序。
  - PDF 實體檔在 `public/prayletters/<YYYY>/<YYYYMM>.pdf`。
  - （註：舊的單一 `src/data/prayletters.json` 已淘汰、移除。）
- **照片**：`src/data/gallery.json`（陣列 `{ src, alt }`），圖片在 `public/images/`；CMS 新上傳圖片放 `public/uploads/`。由 `src/data/site.ts` 匯出（另含 `navItems`、`contact`）。

## 頁面與元件

- `src/pages/`：`index.astro`、`prayletter/index.astro`、`prayletter/[slug].astro`（用 PDF.js 從 cdnjs 內嵌顯示 PDF，桌機手機皆可）、`pictures.astro`、`join.astro`。
- `src/layouts/BaseLayout.astro`（頁首含「登入」鈕，連到雲端後台）、`src/components/`（`SectionTitle`、`PrayletterCard`）。
- 樣式：`public/styles/global.css`。品牌色橙 `#e35a0f` / 金 `#f4b43c`；標題襯線，英雄大標黑體。

## 內容管理（三種後台，主用第 1 種）

1. **雲端後台（主要）**：`admin-cloud/`，Node 應用、部署於 Vercel：**https://admin-cloud-six.vercel.app/** 。透過 GitHub API 把禱告信 PDF + JSON commit 回 repo。網站「登入」鈕即連此。Vercel 環境變數見 `admin-cloud/README.md`（`ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`GITHUB_TOKEN` 具 Contents 寫入權…）。
2. **Pages CMS**：`app.pagescms.org`，設定檔 `.pages.yml`。主要用於照片，禱告信亦可。
3. **本機後台**：`scripts/admin-server.mjs`（`後台管理.bat` 或 `npm run admin`，localhost:4330，密碼在 `scripts/admin-config.json`）。改完需 `git push`。

> ⚠️ 上傳大小限制：雲端後台與 Pages CMS 都經 Vercel/serverless，單次上傳約 **4–5MB 上限**；超過會回「Request Entity Too Large」（前端可能顯示「…is not valid JSON」）。大檔要先壓縮 PDF，或改用本機後台（走 git push，單檔上限 100MB）。

## 慣例與注意事項

- 不要提交 `scripts/admin-config.json`（含密碼，已 gitignore）；`.claude/` 已 gitignore。
- 禱告信請透過後台新增，或手動在 `src/data/prayletters/` 加一個 `<YYYY-MM>.json`（欄位如上）＋放 PDF 到 `public/prayletters/<YYYY>/`。
- Windows 換行（CRLF）常讓 `git status` 顯示一堆檔案「已修改」，多為純換行差異、無實質變更（可用 `git diff -w` 確認），一般可忽略。
- **搬移／換機一律用 `git clone` 重抓**，勿跨磁碟剪貼 `.git`（曾因此損壞 git 物件）。
- 部署平台：GitHub Pages（前站）＋ Vercel（雲端後台）；兩者獨立。

## 關鍵路徑速查

- 資料：`src/data/prayletters/*.json`、`src/data/gallery.json`、`src/data/site.ts`、`src/data/prayletters.ts`
- 設定：`astro.config.mjs`、`.pages.yml`、`.github/workflows/deploy.yml`、`public/CNAME`
- 後台：`admin-cloud/`、`scripts/admin-server.mjs`
- 文件：`使用手冊.md`（人類操作）、`PROJECT_NOTES.md`（歷史）、本檔（AI 索引）
