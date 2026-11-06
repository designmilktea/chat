# Google 登入持續性與名稱調查（2026-11-07，Asia/Tokyo）

## 登入修正

根因是 `dist/firebase-cloud.mjs` 明確呼叫 `setPersistence(auth,browserSessionPersistence)`。此模式只保留目前分頁／工作階段，關閉後可能需要重新登入。新版本使用 `initializeAuth` 指定 `browserLocalPersistence` 與 Google popup resolver，並在註冊登入狀態監聽、提供登入操作前，等待 `setPersistence(auth,browserLocalPersistence)` 完成。

實際 Chrome 測試發現：Firebase SDK 13.1.0 若先用 `getAuth` 預設儲存方式初始化，再切到 `browserLocalPersistence`，本次測試中的另一分頁沒有收到換帳號事件。直接從 local persistence 初始化後，換帳號與登出均可同步。因此修正包含初始化方式，並非只替換 `setPersistence` 的參數。這是本次測試觀察，不代表所有 SDK 版本或瀏覽器都有相同問題。

- 同一瀏覽器設定檔、同一來源重新整理或完全關閉重開後，可還原登入。
- 舊版本的 session-only 登入在更新後可能需要重新登入一次。既有雲端資料及 UID 本機快取不會被刪除或搬移。
- 主動登出仍呼叫 Firebase `signOut`；其他分頁會跟著登出。換帳號時隱藏舊資料、撤銷本頁 AI 工具權限，再載入新 UID 的資料。
- 舊帳號延遲回傳的載入／儲存結果不會更新新帳號的資料或同步佇列；新帳號的工作會在舊工作結束後繼續。
- 本機快取仍依 UID 分開；Firestore 路徑、UID 檢查與版本交易保持原有保護，沒有放寬規則，也沒有啟用 Firestore 磁碟離線快取。
- 若持久儲存被拒絕，連線失敗會顯示錯誤，不會默默降級成短期登入。無痕模式、清除網站資料或瀏覽器自動清除資料仍可能需要重新登入。
- 共用裝置使用完請主動登出。登入持續性不是本機加密；有權使用同一瀏覽器設定檔的人仍可能讀取瀏覽器儲存內容。

## `chat-records-683bb.firebaseapp.com` 從哪裡來

| 設定 | 何時決定 | 能否改 |
| --- | --- | --- |
| Firebase / Google Cloud project ID：`chat-records-683bb` | 建立雲端專案前確認；建立時固定 | 建立後不可修改。改顯示名稱不會改 ID |
| 預設登入網域：`chat-records-683bb.firebaseapp.com` | Firebase 依 project ID 自動配置 | 不能靠修改專案顯示名稱更名；可改用已設定完成的自訂 auth domain |
| Firebase 專案名稱／Public-facing name | 建立時設定，之後可編輯 | 可編輯，但不保證改變 Google 顯示的網域或 OAuth 品牌 |
| Google OAuth App name、Logo、支援信箱、網站與隱私政策 | 設定 Google 登入時，在 Google Auth Platform → Branding 確認 | 可編輯；正式顯示 app name / logo 需要品牌驗證，修改後可能需重新驗證 |
| 網站網址及自訂登入網域 | 架構規劃、首次公開前確認 | 可日後設定；仍可使用同一 Firebase 專案及使用者資料 |

Firebase 的 Google 登入會使用設定中的 `authDomain` 處理 OAuth。這個網站的 `dist/firebase-config.js` 指向 `chat-records-683bb.firebaseapp.com`，因此使用者在登入過程看到它符合預設行為。Google 說明也指出，未完成品牌驗證時，同意畫面可能只顯示應用程式網域；只填一個新 App name 不保證立即取代網域。

本次沒有讀取這個專案的 Google Cloud Branding 後台，因此**無法確認現有 App name 或品牌驗證狀態**；不能僅憑使用者看到的字串斷定是哪個後台欄位未完成。

可追溯的 repository 證據：

- `f888c27`（2026-11-04 03:13 JST）首次記錄專案 `chat-records-683bb` 已建立，並加入 `.firebaserc`；這表示 ID 當時已選定。相同 commit 已含 session persistence 的登入服務草稿。
- `e0c7a87`（2026-11-05 15:18 JST）把目前使用的公開 `firebase-config.js` 納入版本，包括這個 authDomain。
- Git 紀錄無法證明建立 Console 專案時，ID 是人工輸入、接受自動建議，或由哪段對話確認；本次可讀取的舊對話也沒有那段完整操作。

## 現在可採取的名稱調整

1. 保留既有專案，在 [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding?project=chat-records-683bb) 確認品牌名稱、支援信箱、網站／隱私政策等，再依需要送品牌驗證。驗證所需的首頁須說明產品，不能只有登入入口；先確定想使用的品牌與可驗證網域。
2. 若要控制登入過程顯示的網域，使用自己持有的網域，例如 `auth.<你的網域>`：連到**同一專案**的 Firebase Hosting、完成 DNS 與 SSL → 加入 Firebase Auth 授權網域 → 在正確的 Google OAuth Web client 加入 `https://<登入網域>/__/auth/handler` redirect URI → 更新前端 authDomain 及 CSP 的明確白名單 → 驗證 popup、換帳號與登出。
3. 前端可以繼續放 GitHub Pages；只讓自訂登入子網域使用 Firebase Hosting。不要把 `authDomain` 直接改成 `designmilktea.github.io/chat/`，它是路徑且 GitHub Pages 未提供 Firebase 的 `/__/auth/handler`。

這兩項可沿用目前的 project ID、Google OAuth client 和 Firestore UID 資料；不需為了品牌名稱建立新 Firebase 專案。本次只調查選項，未改品牌、DNS、OAuth client、Firebase 設定或資料。

## 未來合作的確認時點

建立任何雲端專案前，先一起確認「產品顯示名稱、不可變 project ID、正式網站網址、登入網域、資料地區、登入保留／共用裝置政策」。由協作者列出建議值、哪些不可變、使用者會在哪裡看到它們，取得確認後才建立資源。

啟用 Google 登入時，再確認 Branding、必要 scopes、支援信箱、首頁與隱私政策、OAuth origins / redirect URI，以及品牌驗證安排。首次公開前，一起驗收實際登入畫面、關閉重開、主動登出、多分頁與帳號隔離。

## 測試與界線

- `npm run check`、`npm test`：語法、既有功能／安全／編碼、持久儲存初始化與 await 順序、Google-only 登入、登出、儲存被拒絕、UID 讀寫防護、版本衝突，以及換帳號時延遲載入／儲存的成功及失敗。
- `tests/browser-auth.test.mjs`：真實 Chrome + 與網站相同的 Firebase 13.1.0 SDK，使用獨立臨時設定檔、虛構 Google 帳號、模擬 Auth Emulator 回覆；已驗證重新整理、完全關閉重開、多分頁換帳號／登出、登出後重開，以及舊 session 重新登入後持續保留。
- 瀏覽器測試只允許本機測試站、Firebase SDK 公開下載與本機模擬 Auth 回覆，會阻擋其他請求。沒有登入真實 Google 帳號、建立正式 Auth 使用者，或讀寫正式 Firestore。這不取代真實 Google OAuth、所有瀏覽器／裝置或線上資料庫規則的完整端到端驗證。

選擇性瀏覽器測試不增加網站或 CI 的套件依賴。可在臨時目錄安裝 Playwright，指定其 `index.mjs` 與本機 Chrome 路徑後執行：

```sh
npm install --prefix /private/tmp/chat-auth-validation --ignore-scripts --no-audit --no-fund playwright@1.56.1
PLAYWRIGHT_MODULE=/private/tmp/chat-auth-validation/node_modules/playwright/index.mjs \
BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
npm run test:browser
```

## 官方依據

- [Firebase：登入狀態持久性與多分頁行為](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [Firebase：專案 ID 與專案識別資訊](https://firebase.google.com/docs/projects/learn-more#project-id)
- [Firebase：Google 登入及自訂 redirect domain](https://firebase.google.com/docs/auth/web/google-signin#customizing-the-redirect-domain-for-google-sign-in)
- [Google：Manage OAuth App Branding（含驗證與首頁要求）](https://support.google.com/cloud/answer/15549049?hl=en)
- [Firebase：修改專案名稱與 Public-facing name](https://support.google.com/firebase/answer/9137752?hl=en)
