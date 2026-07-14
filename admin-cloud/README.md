# 加利利傳道會雲端後台

這是一個獨立雲端後台，用來新增每月禱告信 PDF，並透過 GitHub API commit 回正式網站 repo。

## 本機預覽

```powershell
$env:ADMIN_PASSWORD="本機測試密碼"
node server.mjs
```

開啟：

```text
http://127.0.0.1:8787/
```

本機未設定 `GITHUB_TOKEN` 時，發布會直接寫入上一層 repo 的本機檔案：

- `src/data/prayletters/<YYYY-MM>.json`
- `public/prayletters/<YYYY>/<YYYYMM>.pdf`

## Vercel 環境變數

上線前在 Vercel Project Settings 設定：

```text
ADMIN_PASSWORD
ADMIN_SESSION_SECRET
GITHUB_TOKEN
GITHUB_OWNER=galilee7989
GITHUB_REPO=galilee7989.github.io
GITHUB_BRANCH=main
GITHUB_AUTHOR_NAME
GITHUB_AUTHOR_EMAIL
```

不要把實際值寫進 repo。

`GITHUB_TOKEN` 需要能寫入 `galilee7989/galilee7989.github.io` 的 Contents 權限。

## 部署

在 `admin-cloud` 目錄執行：

```powershell
vercel
vercel --prod
```

部署後可先使用 Vercel 提供的網址測試，再視需要設定 `admin.galilee.org.tw`。
