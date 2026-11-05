# GitHub Pages + Firebase 上線檢查

## 架構
- 程式碼：GitHub 公開 repository `designmilktea/chat`。公開程式碼不代表公開使用者資料。
- 靜態網站：GitHub Pages，預期網址 `https://designmilktea.github.io/chat/`（啟用前不可視為可用網址）。
- 驗證：Firebase Authentication，只允許 Google。
- 資料：Firestore 專案 `chat-records-683bb`，台灣 `asia-east1`；以 Firebase UID 隔離。
- 前端初始畫面要求 Google 登入。若帳號沒有雲端資料，提供建立新的分類與聊天；不會自動把舊 Sites 的資料上傳。

## 尚待管理員完成的兩個設定

### 1. 啟用 GitHub Pages
在 repository `Settings → Pages → Build and deployment → Source` 選 `GitHub Actions`。GitHub Actions 已有 `.github/workflows/pages.yml`，會在 main 分支推送時執行語法、功能、安全與雲端資料模型測試，再上傳 `dist` 並部署。原本自動啟用 Pages 的嘗試被 GitHub 拒絕（Resource not accessible by integration），所以這一步需要 repository 擁有者操作。

啟用後可從 GitHub Actions 頁面執行 `Publish chat website` workflow 的 `Run workflow`，或推送新 commit。

### 2. 將 GitHub Pages 網域加入 Firebase Auth
Firebase Console → `chat-records-683bb` → Authentication → Settings → Authorized domains → Add domain：
`designmilktea.github.io`

只填主機名稱，不填 `https://` 或 `/chat/` 路徑。此設定讓 GitHub Pages 的 Google 登入來源獲得授權。不要啟用 Email/Password、Anonymous 或其他登入提供者。

## 上線驗證（未完成）
1. 在未登入狀態開啟新網址，應只顯示 Google 登入入口。
2. 使用 Google 帳號 A 新增聊天、思緒、假設；確認畫面顯示「已同步至雲端」後重新整理，核對內容。
3. 使用另一個瀏覽器裝置登入 A，核對內容。
4. 登出後，使用 Google 帳號 B；不得看到 A 的紀錄。
5. 用 B 嘗試直接讀寫 A 的 Firestore UID 路徑，應被 Security Rules 拒絕。
6. 測試暫時離線、跨裝置版本衝突、修改/刪除復原、匯出備份。

## 舊 Sites 紀錄搬移
舊網站與 GitHub Pages 不同來源，localStorage 無法自動跨網域讀取。先在舊網站匯出 JSON 備份，再於 GitHub Pages 登入目標 Google 帳號，使用「匯入其他網站的 JSON 備份」，核對目的帳號與筆數後確認。若雲端已有資料，會停止匯入，以免覆蓋現有紀錄。

## 狀態
- Firebase 專案、Firestore 和規則曾在 Console 完成設定；具體雲端讀寫仍需要在公開網址進行端到端驗證。
- GitHub Actions PR 的程式碼檢查與測試已通過。
- GitHub Pages 部署尚未成功：未啟用 Pages，GitHub Actions 無法自行建立 Pages site。
- Google 在 GitHub Pages 網域的登入尚未驗證，需設定 authorized domain。
