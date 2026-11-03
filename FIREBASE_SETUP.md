# Firebase 接入狀態

Firebase 專案：chat-records-683bb（免費 Spark）。Web App：chat-web。

已完成 Firebase Console 登入、專案建立、Web App 註冊、Google 登入啟用及目前網站網域授權。未啟用 Google Analytics，也未啟用建立流程中的 Gemini 選項。

Firestore 資料庫尚未建立：選擇 asia-east1（Taiwan）被自動審核擋下，要求使用者明確同意永久資料地區。不可在未取得同意前選擇其他地區繼續。

## 程式狀態

- dist/firebase-config.js：從 Console 取得的公開 Web App 設定。
- dist/cloud-codec.mjs：將分類、聊天、現實行動、思緒與假設編碼成個別雲端文件，保留順序與父子關係；大型回收桶項目拆成多個文件。已通過本機回歸測試。
- dist/firebase-cloud.mjs：Google 登入與 Firestore 讀寫服務草稿，使用版本號避免覆蓋其他裝置的新資料。目前尚未由網站載入，也未做真實 Firebase 整合測試。
- firestore.owner.rules：登入 UID 隔離的規則草稿，尚未部署或在 Emulator 測試。
- firestore.rules：現有預備設定仍拒絕所有存取。

## 接續步驟

1. 使用者同意資料庫地區後，建立 Standard Firestore，初始使用正式環境模式。
2. 驗證並部署每個 UID 的存取規則，測試未登入、不同帳號與資料格式限制。
3. 整合網站登入與雲端狀態；同步寫入失敗不可回報成功。更新 CSP 僅開放必要的 Google/Firebase 端點。
4. 原有本機紀錄需先備份、再由使用者明確啟動匯入，核對筆數後才顯示完成。不可自動刪除原資料。
5. 完成真實登入、同步、衝突、離線重試與退出帳號隔離測試後，再部署正式網站。

目前網站仍使用原本的本機儲存，這些準備檔不表示雲端同步已完成。不要將服務帳號 JSON、管理端憑證或私人紀錄加入 repository。
