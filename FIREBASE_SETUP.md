# Firebase 接入狀態

目前 Firebase 尚未連線，所有紀錄仍只存在原本瀏覽器。此專案的 firebase.json 與 firestore.rules 是部署準備檔，沒有指定專案，也沒有部署至 Firebase。

## 接入時需要的資訊

- Firebase Project ID。
- 已註冊 Web App 的公開 Firebase configuration（apiKey、authDomain、projectId、appId 等）。Firebase Web configuration 是用於識別專案的前端設定，不能當作資料庫的存取權限。
- Firebase Console 中啟用 Google 登入，並確認允許的網站網域。

請勿將服務帳號 JSON、私鑰、管理端憑證或個人聊天紀錄加入 repository。

## 執行順序

1. 確認 Firebase 專案、地區與 Google 登入設定。
2. 接入模組化 Web SDK，調整現有 CSP 的 connect-src/script-src 以允許實際需要的 Firebase 登入與資料端點，避免移除整份 CSP。
3. 按登入 UID 隔離 categories、chats、messages、thoughts、hypotheses；各筆資料保留目前的穩定 ID、附著關係和順序。
4. 使用 Emulator 測試未登入、其他 UID、無效欄位、批次操作與軟刪除。現有 firestore.rules 故意拒絕所有存取，需先完成並驗證正式規則。
5. 提供使用者主動啟動的本機資料匯入：先下載備份、核對筆數，雲端確認寫入成功後才顯示完成。不自動刪除原本資料。
6. 完成同步失敗、離線重連、衝突與跨帳號測試後，再部署雲端整合版本。

Firebase Hosting 公開與否、GitHub repository 公開與否、個人資料讀取權限是各自獨立的設定。
