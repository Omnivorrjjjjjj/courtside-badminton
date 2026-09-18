# COURTSIDE 羽球即時戰況

三隊羽球賽的即時觀眾頁與管理介面。觀眾直接開啟連結；主辦者登入後計分、安排球員與輸入文字播報。

- 網站：[COURTSIDE](https://omnivorrjjjjjj.github.io/courtside-badminton/)
- 程式碼：[GitHub repository](https://github.com/Omnivorrjjjjjj/courtside-badminton)
- 預設積分：**每場實際得分累加，包含進行中的比賽；同分並列**。

## 開始使用

1. 右上角「賽事管理」登入。管理帳密由主辦者保管，不會出現在公開程式碼。
2. 「隊員」填寫 A、B、C 隊名與球員姓名；「賽制」設定活動名稱、場地與規則。
3. 「比分」選擇場次、勾選上場球員，按「確認名單並開賽」。
4. 使用加減分或「復原上一球」；達到局末分數後按「確認完賽」，再開下一場。
5. 「播報」輸入現場文字，觀眾會即時收到。

正式賽事已初始化為零比分。隊名與球員目前為待填寫的預設名稱。每台裝置都必須連網；若等待雲端確認，介面會標示連線狀態並停用計分。

## 觀眾與管理 UX

- 電腦：左側三角對戰圖與隊伍積分，右側當前比分與文字播報。
- 手機：目前比分 → 隊伍積分 → 三角對戰圖 → 播報；小螢幕積分表只留排名、隊伍、積分。
- 點 AB／BC／CA 三角邊或分數卡，直接帶到該組明細；點場次查看比分，再按「返回目前戰況」。
- 完整賽程、參賽隊伍分開瀏覽；進階賽制選項收在管理介面。
- 加分按鈕較大，手機至少 56px 高；儲存與錯誤提示顯示於管理視窗內。
- 別台管理裝置更新後，過期名單可按「載入最新名單」重新選擇，避免覆蓋新資料。

## 預設賽制與可調範圍

- A、B、C 三隊，每隊 3 男 1 女；AB、BC、CA 各打一組。
- 每組男雙 1、女單、男雙 2、混雙，共 12 場。
- 每項目一局 31 分，30：30 下一分獲勝。這是本活動設定，並非宣稱正式羽球競賽通則。
- 可調每局目標分、封頂分、領先 1 或 2 分，以及每組 1–8 項目。項目用中文輸入：男雙、女單、混雙、男單、自由配對。
- 上場人數與性別組合會驗證；固定 3 男 1 女名單不能組成女雙。
- 一次一場進行或暫停；完賽確認後才計入勝場。
- 支援累計得分、勝場積分、整組對戰積分。整組以勝場數判斷，四場 2：2 為平手。
- 已有比賽紀錄時，局分與項目鎖定；積分顯示和播報方式仍可調。修改影響賽程的規則前，先匯出備份再清空比分。
- 清空比分會保留球員及賽制。網頁提供 JSON 匯出，沒有任意 JSON 匯入。

## 獨立雲端資料區

本活動使用**專用 Firebase project**，與其他工作資料隔離，不共用既有應用的資料庫、登入帳號或規則。

| 項目 | 設定 |
|---|---|
| Firebase project | `courtside-badminton-20260919` |
| Firestore | `(default)`，`asia-east1`，已啟用資料庫刪除保護 |
| 文件 | `badmintonEvents/three-team-cup` |
| Authentication | Email/Password，僅指定管理者 UID 可寫入 |
| 觀眾權限 | 讀取指定賽事文件；不可列舉集合、寫入或刪除 |
| 計費 | Spark；未綁定付費計費帳戶 |

公開 Web 設定位於 `dist/config.js`。Firebase Web API key 是公開用戶端識別資訊；授權依靠 Firebase Authentication 與 Firestore Rules。管理密碼、服務帳號金鑰與登入 token 不能放進 Git 或網頁。

`firebase.json` 和 `.firebaserc` 僅指向專用活動專案。部署規則時明確指定：

```sh
firebase deploy --only firestore:rules --project courtside-badminton-20260919
```

若 fork 給其他活動，請先建立自己的專用 Firebase project、Web App、管理帳號，替換 `dist/config.js`、`.firebaserc`、`firestore.rules`；不要直接使用本活動的資料區。`firestore.rules.example` 提供規則樣板。

## 即時同步與資料保護

- Firestore `onSnapshot` 接收更新；正式比分只顯示伺服器確認的變更。
- `runTransaction` 比對 revision，避免多台管理装置與舊表單互相覆蓋。離線交易不會排隊成為已儲存比分。
- 單一文件包含設定、名單、賽程、最多 120 則播報，每場最多 500 筆復原紀錄。
- `lineups` 與 `history` 轉成 map 包裝，符合 Firestore 不接受直接巢狀陣列的限制。
- 比賽前後匯出 JSON 備份。前端可回退 Git commit 再部署；資料復原需由專案管理者檢查 schema、當前 revision 與規則，避免覆蓋現場輸入。
- 每次更新會消耗觀眾端的文件讀取額度；免費額度用完可能影響同步。正式活動前查看 Firebase Usage，不會自動替主辦者升級付費方案。

## 本機開發與部署

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
npm test
```

本機開啟 `http://127.0.0.1:4173/`。目前設定連接正式活動，登入後的修改會同步給觀眾。需要隔離示範時，複製 `dist/` 到獨立測試目錄，將該副本 `cloudConfig` 設為 `null` 並使用另一個 `tournamentId`；示範只在相同瀏覽器、相同來源的分頁之間同步。

GitHub Pages 使用 `.github/workflows/pages.yml`，推送 `main` 或手動啟動 workflow 後，先跑測試再部署 `dist/`。Pages 的 Source 必須為 GitHub Actions。資源使用相對路徑，可在 repository 子路徑運作。

### LINE 與社群分享標題

LINE 預覽讀取回傳 HTML 中的 Open Graph 標題；Firebase 載入後修改網頁名稱，不會直接更新分享爬蟲取得的 HTML。發布流程會執行 `node scripts/sync-share-meta.mjs`，唯讀取得目前的公開賽事名稱，同步 `<title>`、Open Graph 與描述，讀取失敗則停止部署。

管理介面改名後，觀眾頁立即更新；**分享標題需再執行一次 GitHub Pages workflow** 才更新。可在 Actions 手動執行 `Deploy Courtside to GitHub Pages`，或用 `gh workflow run pages.yml`。不需改動比分、名單或登入設定。

已送出的 LINE 卡片可能保留舊快取，網站不能直接修改既有聊天訊息。重新分享時可使用帶新版本參數的連結，例如 `?share=20260919-1`；LINE 的實際快取刷新時間由 LINE 決定。

測試與 UX 驗證詳見 [VERIFICATION.md](VERIFICATION.md)。

官方文件：[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Firestore 即時監聽](https://firebase.google.com/docs/firestore/query-data/listen)、[Firestore 交易](https://firebase.google.com/docs/firestore/manage-data/transactions)、[安全規則](https://firebase.google.com/docs/firestore/security/rules-conditions)、[Web API key](https://firebase.google.com/docs/projects/api-keys)。
