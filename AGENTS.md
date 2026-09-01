# AGENTS.md — AI 助理入口

本檔給任何 AI 編碼助理（Claude Code、Cursor、Copilot、Codex 等）快速上手。**完整技術索引請讀 [`CLAUDE.md`](./CLAUDE.md)**；人類操作步驟見 [`使用手冊.md`](./使用手冊.md)；歷史與決策見 [`PROJECT_NOTES.md`](./PROJECT_NOTES.md)。

## 一句話

財團法人基督教加利利傳道會官網。**Astro 靜態網站** → 部署到 **GitHub Pages**。正式網址 https://galilee.org.tw （自訂網域＋HTTPS）。Repo：`galilee7989/galilee7989.github.io`。

## 動手前必讀的黃金守則

- **正本在 GitHub**，本機資料夾只是工作副本；搬移／換機一律 `git clone` 重抓，勿跨磁碟剪貼 `.git`。
- **部署**：push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）自動建置部署。workflow **必須 `node-version: 22`**（Astro 7 不支援 Node 20）。
- **禱告信是 collection**：每月一檔 `src/data/prayletters/<YYYY-MM>.json`（欄位 `title/slug/date/pdf/originalUrl?`），PDF 實體檔在 `public/prayletters/<YYYY>/<YYYYMM>.pdf`；由 `src/data/prayletters.ts`（`import.meta.glob`）載入並依 `date` 由新到舊排序。（舊的單一 `prayletters.json` 已移除。）
- **照片**：`src/data/gallery.json`（`{src, alt}`），由 `src/data/site.ts` 匯出。
- **內容後台三種，主用雲端**：`admin-cloud/`（Vercel，https://admin-cloud-six.vercel.app/ ，網站「登入」鈕連此）；其次 Pages CMS（`.pages.yml`）；本機 `scripts/admin-server.mjs`（`後台管理.bat`）。
  - ⚠️ 雲端後台與 Pages CMS 單次上傳約 **4–5MB 上限**（超過回「Request Entity Too Large」／前端顯示「not valid JSON」）；大檔先壓縮 PDF 或用本機後台（走 git push，單檔上限 100MB）。
- **勿提交** `scripts/admin-config.json`（含密碼，已 gitignore）。
- Windows CRLF 常讓 `git status` 顯示大量「已修改」，多為純換行差異（`git diff -w` 確認），提交時只 `git add` 你實際改動的檔，勿 `git add .` 造成整包換行雜訊。

## 本機開發

`npm install` → `npm run build`（輸出 `dist/`）。本機預覽 `start-galilee.bat`（埠 48732）或 `一鍵啟動.bat`。
