# 加利利傳道會雲端後台

這是一個獨立雲端後台，用來新增每月禱告信 PDF，並透過 GitHub API commit 回正式網站 repo。正式網址：https://admin-cloud-six.vercel.app/

## 本機預覽

```powershell
$env:ADMIN_PASSWORD="本機測試密碼"
node server.mjs
```

開啟：

```text
http://127.0.0.1:8787/
```

沒有預設密碼：本機預覽一定要先設定 `ADMIN_PASSWORD`，否則登入會回 500。

本機未設定 `GITHUB_TOKEN` 時，發布會直接寫入上一層 repo 的本機檔案：

- `src/data/prayletters/<YYYY-MM>.json`
- `public/prayletters/<YYYY>/<YYYYMM>.pdf`

## 資料規則

- 月份代碼 `slug` 必為 `YYYY-MM`；網站的清單順序只看 `slug`。
- JSON 的 `date` 一律由伺服器從 `slug` 推導成該月 1 日，不接受使用者輸入。
- 伺服器會驗證上傳內容以 `%PDF-` 開頭；請求本文上限 4.5MB，前端在選檔時就會擋下超過 3MB 的 PDF。

## 清單載入

登入後的清單優先用 1 個 GraphQL 請求取回全部禱告信。**fine-grained token 不支援 GraphQL**，此時會自動退回原本的 REST 逐檔流程，功能不受影響——之後若把 `GITHUB_TOKEN` 換成最小權限的 fine-grained token，清單載入只是變慢，不會壞。

## 登入安全

- 同一 IP 連續失敗 8 次會鎖定 15 分鐘，鎖定期間即使密碼正確也拒絕。這個紀錄存在函式執行個體的記憶體裡，只能盡力而為；真正的防線是夠長的隨機密碼。
- 正式環境缺少 `ADMIN_SESSION_SECRET` 時，所有 API 一律回 500 並說明原因，不會退回任何寫死的字串。
- 登入後若側欄出現「ADMIN_SESSION_SECRET 偏短」，請換成 32 字元以上的隨機字串。

## Vercel 環境變數

必要（Production）：

```text
ADMIN_PASSWORD         管理密碼，請使用夠長的隨機字串
ADMIN_SESSION_SECRET   session 簽章金鑰，32 字元以上的隨機字串
GITHUB_TOKEN           需能寫入 galilee7989/galilee7989.github.io 的 Contents 權限
```

選填（不設就用 `api/_lib.mjs` 內的預設值）：

```text
GITHUB_OWNER=galilee7989    GITHUB_REPO=galilee7989.github.io    GITHUB_BRANCH=main
GITHUB_AUTHOR_NAME          GITHUB_AUTHOR_EMAIL
```

不要把實際值寫進 repo。更換 `ADMIN_SESSION_SECRET` 後，已登入的 session 會全部失效。

## 部署

後台不會隨著 push 自動更新。改了 `admin-cloud/` 之後，要在這個目錄手動部署：

```powershell
vercel --prod
```

部署後用正式別名驗證（Vercel 給的部署網址可能要求登入，不適合當公開入口）：

```text
https://admin-cloud-six.vercel.app/api/session
```

應回 `{"authenticated":false,...}`；未登入呼叫 `/api/prayletters` 應回 401。
