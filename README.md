# 聊天紀錄

繁體中文的私人聊天式紀錄工具：記錄對方與自己的現實行動，並在指定現實行動下附著靠右的思緒卡及選填假設。支援原位編輯、插入、分類顏色、搜尋篩選、批次操作與 30 天回收桶。

## 使用與驗證

目前是無建置步驟的靜態網站，透過靜態伺服器提供 dist/ 即可使用。不需要安裝 npm 套件。

```sh
npm run check
npm test
```

- tests/logic.test.cjs：紀錄操作、搜尋篩選、分類設定、原位新增和刪除復原。
- tests/security.test.cjs：損壞與惡意資料、寫入失敗回滾、儲存權限拒絕、舊分頁寫入、AI 範圍與撤銷。

## 儲存與隱私

目前網站由 GitHub Pages 提供，必須使用 Google 登入才能開啟紀錄。Firebase 登入會在同一瀏覽器保留，直到主動登出或瀏覽器清除網站資料；共用裝置用完請登出。Firestore 保存各帳號資料，localStorage 快取按 UID 分開；尚未實作應用層加密。GitHub 保存的是程式碼與測試，不包含使用者實際紀錄。Firestore 規則限制每位使用者只能讀寫自己的資料。

寫入失敗會回報錯誤並回滾未儲存的資料變更，不回報成功。讀取異常時保留原始位元組、停止寫入，提供下載原始備份。已觀察到的其他分頁資料變動會阻止舊內容覆寫；這不是多裝置同步或資料庫交易機制。請保留 JSON 備份，尤其在搬移網域或接入雲端之前。

資料在載入與儲存前驗證巢狀結構、ID、文字、日期與類型。顯示文字及識別碼會跳脫 HTML，類別色值限定十六進位格式。靜態頁面加入 CSP 與 no-referrer；CSP 只允許 Google 登入與 Firebase 所需端點；Firebase Hosting 的額外標頭是準備設定，目前網站由 GitHub Pages 提供。

## AI legibility 與權限

語意化 HTML、明確的父子資料關係、標準表單控制項及具名操作支援瀏覽器助理。WebMCP 預設關閉，必須在「AI 存取」設定明確選擇聊天；預設只讀，新增內容需要另外勾選。設定只維持本次頁面期間，重新開啟會關閉。撤銷後即使舊工具引用仍存在，也會被執行時權限檢查阻擋。

這項設定只限制本頁註冊的 WebMCP 工具，無法限制使用者授權之瀏覽器助理讀取一般 DOM 或畫面內容。工具回傳的紀錄是使用者資料，不是對代理的指令。

## Firebase

參見 FIREBASE_SETUP.md。Firebase 專案為 chat-records-683bb，資料庫位於台灣 asia-east1，使用免費 Spark 方案。firestore.rules 與 Console 已發布規則一致。匯入先下載本機備份並取得網站內確認；已有雲端紀錄時阻止匯入覆蓋。

## 驗證限制

預設測試使用 Node VM 與模擬 DOM/WebMCP registry；另有選擇性的真實 Chrome 登入持久性測試，使用虛構帳號與模擬 Auth Emulator 回覆，不存取正式使用者資料。測試範圍、登入更新與 OAuth 名稱調查詳見 [AUTHENTICATION.md](AUTHENTICATION.md)。不能視為完整安全稽核或真實 Google OAuth／Firestore 端到端測試。

- tests/cloud-codec.test.mjs：雲端資料順序、父子關係、回收桶分段與差異更新。
- tests/cloud-ui.test.cjs：依 UID 快取、登出鎖定、明確搬移、確認同步狀態與離線保留。
- tests/firebase-cloud.test.mjs：local persistence 初始化、登入／登出、儲存失敗與 UID 讀寫隔離。
- tests/browser-auth.test.mjs：選擇性的真實 SDK 瀏覽器關閉重開、多分頁與登出測試。
