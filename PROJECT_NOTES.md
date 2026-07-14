# 加利利傳道會網站 — 專案說明與歷史

這份文件記錄本網站的架構、維護方式與重要決定，讓任何人（或任何 AI 助理）在任何電腦上都能快速接上進度。搬移資料夾或換電腦都不影響——真正的來源是 GitHub repo。

## 一、基本資料

- 正式網址：https://galilee.org.tw （已啟用 HTTPS；www 會自動轉址）
- GitHub 帳號：galilee7989
- 原始碼 repo：https://github.com/galilee7989/galilee7989.github.io
- 技術：Astro（純靜態網站產生器）→ 建置後部署到 GitHub Pages
- 網域 DNS：在 TWNIC「主機模式」設定，galilee.org.tw 四筆 A（185.199.108–111.153）+ www CNAME → galilee7989.github.io

## 二、換電腦 / 搬資料夾怎麼辦

網站掛在 GitHub 上，跟本機資料夾無關，隨時都在線上。要在新電腦上繼續維護：

1. 安裝 Git 與 Node.js（22 版以上）。
2. `git clone https://github.com/galilee7989/galilee7989.github.io.git`
3. 進資料夾 `npm install`。
4. 之後改內容 → `git add . && git commit -m "說明" && git push`，GitHub 會自動重建上線。

看歷史：`git log --oneline`。

## 三、如何更新內容（新增禱告信 / 照片）

有兩種方式，擇一即可：

### A. 客製雲端後台（推薦）
- 正式網址：https://admin-cloud-six.vercel.app/
- 程式在 `admin-cloud/`，部署到 Vercel 專案 `admin-cloud`。
- 本機預覽：`npm run admin-cloud`，開 `http://127.0.0.1:8787/`。
- 上雲後透過 GitHub API 寫入 `src/data/prayletters/<YYYY-MM>.json` 與 `public/prayletters/<YYYY>/<YYYYMM>.pdf`。
- 需要在部署平台設定 `ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`GITHUB_TOKEN` 等環境變數；不得寫入 repo。
- 網站選單的「登入」按鈕即連到此後台。

### B. Pages CMS 網頁後台（備用）
- 到 https://app.pagescms.org ，用 GitHub 帳號 galilee7989 登入，開啟 repo `galilee7989.github.io`。
- 左側「禱告信」「照片」→ 新增項目 → 填欄位、上傳 PDF/圖片 → Save。
- 存檔即自動 commit 到 repo，GitHub Actions 約 1–2 分鐘重建上線。
- 設定檔為 repo 根目錄的 `.pages.yml`；CMS 上傳的檔案存到 `public/uploads/`。

### C. 本機後台
- 雙擊 `後台管理.bat`（或 `npm run admin`）→ 瀏覽器開 http://127.0.0.1:4330/ → 密碼在 `scripts/admin-config.json`。
- 新增禱告信／照片後，`git commit` + `git push` 讓網站更新。

## 四、本機預覽與啟動檔

- `一鍵啟動.bat`：建置並同時開「前站」＋「本機後台」。
- `start-galilee.bat`：只開前站（http://127.0.0.1:48732/）。
- `後台管理.bat`：只開本機後台。

## 五、資料與重要檔案

- 禱告信資料：`src/data/prayletters/`（一篇一個 JSON，每筆有 title / slug / date / pdf）。PDF 檔在 `public/prayletters/<年>/<年月>.pdf` 或 Pages CMS 上傳選定的位置。
- 照片資料：`src/data/gallery.json`（陣列，每筆 src / alt）。圖片在 `public/images/`。
- 首頁與禱告信列表會依 `date` 由新到舊自動排序，所以新增的內容會排到最前面。
- 網站樣式：`public/styles/global.css`。版面元件在 `src/layouts`、`src/components`、`src/pages`。
- 圖片：`public/images/logo.png`（頁首標誌）、`public/images/hero.png`（英雄區與事工方框背景）。
- 部署設定：`.github/workflows/deploy.yml`（GitHub Actions；**必須 `node-version: 22`**，Astro 7 不支援 Node 20）。

## 六、禱告信 PDF 檢視方式

禱告信內頁（`src/pages/prayletter/[slug].astro`）用 PDF.js（由 cdnjs 載入）把 PDF 直接畫在頁面上，桌機與手機皆可內嵌觀看；載入失敗時顯示「點此開啟 PDF」備援連結。

## 七、容量與費用

- 全部免費（GitHub Pages）。網站容量上限約 1 GB、單檔上限 100 MB、每月流量約 100 GB——以教會用量遠遠用不到。

## 八、變更歷史摘要（2026-07 上線）

- 網站整體美化改版（橙金配色、襯線／黑體標題、英雄區、卡片與動效）。
- 首頁：軍福簡介分行；照片移到「異象與事工」三方框下方；三方框以 hero.png 局部暗底襯托文字。
- 加入本機後台（禱告信 / 照片 / 改密碼）。
- 推上 GitHub Pages、接自訂網域 galilee.org.tw 並啟用 HTTPS。
- 禱告信改用 PDF.js 內嵌檢視，修正手機無法觀看。
- 加入 Pages CMS 網頁後台（.pages.yml），可從任何瀏覽器登入管理。
- 加入客製雲端後台 `admin-cloud/` 並部署到 Vercel；「登入」鈕改連客製後台。
