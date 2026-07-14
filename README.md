# 加利利傳道會靜態網站

這個專案使用 Astro 產生純靜態網站。固定頁面維持靜態，禱告信用 `src/data/prayletters/` 裡的一篇一檔 JSON 產生列表與單篇頁，PDF 存在 `public/prayletters/`。

## 常用指令

```bash
npm install
npm run build
```

本機驗證靜態輸出：

```bash
npm run build
node scripts/serve-dist.mjs
```

開啟：

```text
http://127.0.0.1:4322/
```

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
  "date": "2026-05-31T00:00:00",
  "pdf": "/prayletters/2026/202605.pdf",
  "originalUrl": ""
}
```

3. 執行：

```bash
npm run build
```

## 從舊 WordPress 匯入禱告信

如果舊 WordPress 仍在線上，可重新匯入公開 API 裡的禱告信與 PDF：

```bash
npm run import:prayletters
npm run build
```

匯入腳本會下載 PDF 到 `public/prayletters/`，並重建 `src/data/prayletters/` 裡的一篇一檔 JSON。既有 PDF 會跳過不重抓。

## 預留 Decap CMS

雲端後台使用 Pages CMS，禱告信已改成 content collection，新增時會是一篇一檔，不再編輯大型 JSON 陣列。

建議等第一版上線穩定後再加：

- `/admin/` 後台入口
- GitHub OAuth 或部署平台 Identity
- 禱告信 collection：標題、月份、PDF

## 部署

任何能放靜態檔的主機都可以部署 `dist/`。建議選項：

- Cloudflare Pages
- Netlify
- Vercel
- 既有主機的靜態目錄

部署指令：

```bash
npm run build
```

輸出目錄：

```text
dist/
```

## 後台管理（本機新增禱告信）

不需架伺服器或登入，直接在自己電腦操作：

1. 雙擊專案根目錄的 `後台管理.bat`（或執行 `npm run admin`）。
2. 瀏覽器會開啟 `http://127.0.0.1:4330/`。
3. 選擇 PDF、填年份與月份（標題留空會自動用「YYYY年MM月禱告信」），按「新增禱告信」。
   - PDF 會自動存到 `public/prayletters/<年>/<年月>.pdf`
   - `src/data/prayletters/<年-月>.json` 會自動新增，網站依日期由新到舊排序
4. 按「重新建置網站」（等同 `npm run build`），禱告信分頁即更新。
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

- 網站選單右側有「登入」按鈕，會開啟本機後台 `http://127.0.0.1:4330/`（需先啟動 `後台管理.bat`）。
- 預設密碼為 `galilee2026`，登入後可在「帳號」分頁修改；密碼存於 `scripts/admin-config.json`。
- 因為是靜態網站，實際編輯需透過本機後台程式執行，登入頁與管理面板僅在本機（127.0.0.1）運作，不會對外公開。

## 一鍵啟動

雙擊 `一鍵啟動.bat`：會自動建置網站，並在兩個新視窗分別啟動「前站」與「後台管理」，然後開啟瀏覽器。

- 前站： http://127.0.0.1:48732/
- 後台： http://127.0.0.1:4330/ （選單「登入」也會連到此處，預設密碼 galilee2026）

只想開前站可用 `start-galilee.bat`（埠 48732）；只想開後台可用 `後台管理.bat`。
