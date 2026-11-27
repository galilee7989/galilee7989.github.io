# 加利利傳道會靜態網站

這個專案使用 Astro 產生純靜態網站。固定頁面維持靜態，禱告信用 `src/data/prayletters/` 裡的一篇一檔 JSON 產生列表與單篇頁，PDF 存在 `public/prayletters/`。

## 常用指令

```bash
npm install
npm run build      # 建置；會先驗證禱告信資料，有問題就失敗並指名檔案
npm run verify     # 改完必跑：建置＋清單順序＋首頁＋PDF 一次檢查
```

本機預覽建置結果：

```bash
npm run build
node scripts/serve-dist.mjs      # 預設埠 4322
```

開啟：

```text
http://127.0.0.1:4322/
```

（`start-galilee.bat` 與 `一鍵啟動.bat` 做的是同一件事，只是改用埠 48732。）

## 每月新增禱告信

1. 將 PDF 放到對應年份資料夾，例如：

```text
public/prayletters/2026/202605.pdf
```

2. 在 `src/data/prayletters/` 新增一個 JSON 檔，例如 `2026-05.json`：

```json
{
  "title": "2026年05月禱告信",
  "slug": "2026-05",
  "date": "2026-05-01",
  "pdf": "/prayletters/2026/202605.pdf",
  "originalUrl": ""
}
```

> 檔名、`slug`、`pdf` 三者必須互相吻合，建置時會驗證。`date` 慣例填該月 1 日，只供後台顯示；清單排序只看 `slug`（即檔名），填錯不影響順序。

3. 執行：

```bash
npm run verify
```

## 從舊 WordPress 匯入禱告信

如果舊 WordPress 仍在線上，可重新匯入公開 API 裡的禱告信與 PDF：

```bash
npm run import:prayletters
npm run build
```

匯入腳本會下載 PDF 到 `public/prayletters/`，並重建 `src/data/prayletters/` 裡的一篇一檔 JSON。既有 PDF 會跳過不重抓。

## 雲端後台

正式後台已部署在：

```text
https://admin-cloud-six.vercel.app/
```

網站選單右側的「登入」會開啟這個雲端後台。新增禱告信時，後台會自動上傳 PDF，並透過 GitHub API 寫入：

- `public/prayletters/<年>/<年月>.pdf`
- `src/data/prayletters/<年-月>.json`

Vercel 環境變數需設定 `ADMIN_PASSWORD`、`ADMIN_SESSION_SECRET`、`GITHUB_TOKEN`；實際值不可寫進 repo。

## 部署

正式網站放在 GitHub Pages。流程：push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）自動執行 `npm run build` 並部署 → 約 1～2 分鐘後 https://galilee.org.tw 更新。建置失敗時網站會維持舊版，壞資料不會上線。

建置輸出在 `dist/`（不提交到 git）。

## 後台管理（本機新增禱告信）

後台只在本機（127.0.0.1）執行，需要密碼登入：

1. 雙擊專案根目錄的 `後台管理.bat`（或執行 `npm run admin`）。
2. 瀏覽器會開啟 `http://127.0.0.1:4330/`，輸入密碼登入（密碼在 `scripts/admin-config.json`，第一次啟動會自動產生）。
3. 選擇 PDF、填年份與月份（標題留空會自動用「YYYY年MM月禱告信」），按「新增 / 更新禱告信」。
   - PDF 會自動存到 `public/prayletters/<年>/<年月>.pdf`
   - `src/data/prayletters/<年-月>.json` 會自動新增，`date` 固定為該月 1 日
4. 按「重新建置網站」只會更新本機預覽。要讓正式網站更新，還需 `git add` 這兩個檔案、commit、push。
5. 關閉後台：在黑色視窗按 `Ctrl+C`。

後台只在本機（127.0.0.1）執行，不會對外公開，`admin-server.mjs` 也不會被部署到 `dist/`。

### 後台：新增照片

在後台頁面切換到「照片」分頁：

1. 選擇圖片（JPG / PNG / WEBP），可填圖片說明。
2. 按「新增照片」，圖片會存到 `public/images/gallery/`，並更新 `src/data/gallery.json`。
3. 「目前照片」區可預覽、移除（移除只從清單拿掉，檔案保留）。
4. 按「重新建置網站」後，首頁與「照片區」即顯示新照片。

相簿資料來源為 `src/data/gallery.json`，網站透過 `src/data/site.ts` 讀取。

### 登入後台

- 網站選單右側有「登入」按鈕，會開啟雲端後台 `https://admin-cloud-six.vercel.app/`。
- 使用 Vercel Production 環境變數 `ADMIN_PASSWORD` 設定的密碼登入。
- 發布禱告信後，後台會 commit 到 GitHub repo，GitHub Pages 約 1-2 分鐘後重建正式網站。
- 本機後台 `http://127.0.0.1:4330/` 仍可當備用工具使用，需先啟動 `後台管理.bat`。

## 一鍵啟動

雙擊 `一鍵啟動.bat`：會自動建置網站，並在兩個新視窗分別啟動「前站」與「後台管理」，然後開啟瀏覽器。

- 前站： http://127.0.0.1:48732/
- 後台： http://127.0.0.1:4330/ （密碼存在 `scripts/admin-config.json`，第一次啟動會自動產生隨機密碼）

只想開前站可用 `start-galilee.bat`（埠 48732）；只想開後台可用 `後台管理.bat`。
