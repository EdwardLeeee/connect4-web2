# 送審清單（草稿）

App Store 與 Google Play 後台要填的內容。以下是依目前程式寫的**草稿**，填寫前由 ceo 對照程式與
`PRIVACY.md` 再確認一次；標「待決定」的項目要先問使用者。

## 共用資料

| 欄位 | 內容 |
|---|---|
| App 名稱 | 繁中「四子棋」、英文「Four In A Row」；其他語言顯示英文 |
| 主要語言 | English (U.S.)：沒有翻譯的語言會顯示主要語言；再加繁中與簡中的「四子棋」 |
| Bundle ID／Package | `com.oraclelee.connect4` |
| 類別 | 遊戲 → 棋盤遊戲（Board） |
| 隱私權政策網址 | https://github.com/EdwardLeeee/connect4-web2/blob/main/PRIVACY.md （PR 合併到 main 後才存在） |
| 支援網址（App Store 必填） | https://github.com/EdwardLeeee/connect4-web2/issues |
| 需要登入 | 否，沒有帳號 |
| 廣告／App 內購買 | 無 |
| 加密出口規範 | 只用系統的 HTTPS；Info.plist 已設 `ITSAppUsesNonExemptEncryption = false`，上傳時不用再回答 |

**名稱可能被占用**：App Store 的名稱全站唯一，建立 app 時才知道「四子棋」或「Four In A Row」能不能用。
被占用就停下來回報 ceo，由使用者另取，不要自己改名。

**商標**：畫面上仍有 CONNECT 4 字樣（Hasbro 的註冊商標）；使用者已接受可能因 Apple 5.2.1 被退件的風險。

## App Store：App Privacy（草稿）

- 是否收集資料：**是**。
- Identifiers → **User ID**：伺服器用一組隨機代碼辨識連線。用途：App Functionality。
- User Content → **Other User Content**：暱稱，會顯示給同一局的對手。用途：App Functionality。
- 兩項都**不用於追蹤**。
- 是否「與使用者身分連結」：草稿填**否**。理由：沒有帳號，代碼是隨機產生的，資料只在伺服器記憶體、
  重啟就清除。這是判斷題，送出前請 ceo 確認。
- 伺服器與 Cloudflare 的連線紀錄（IP 等）只用於維運與安全；App Privacy 沒有對應的「IP 位址」類型，
  也沒有用它推算位置，所以不另外申報。
- `mobile/ios/App/App/PrivacyInfo.xcprivacy` 已照上面兩項宣告，並宣告使用 UserDefaults（理由碼 CA92.1，
  Capacitor Preferences 存 token 用）。改答案時兩邊要一起改。

## Google Play：Data safety（草稿）

- 是否收集或分享必須申報的使用者資料：**收集，不分享**。Cloudflare 是代表我們處理資料的服務商，
  依 Google 的定義不算分享。
- 傳輸加密：**是**（HTTPS／WSS）。
- 提供刪除要求的方式：沒有帳號，資料在伺服器重啟時自動清除；刪除 app 就清掉手機上的代碼。
- 資料類型：
  - Device or other IDs：隨機連線代碼。收集，必要，用途 App functionality。
  - App activity → Other user-generated content：暱稱（預設「玩家 NNNN」，可改）。收集，必要，用途
    App functionality。
- 目標對象（Target audience）：**待決定**。勾選 13 歲以下會適用 Families 政策，要求更多；草稿建議
  13 歲以上。

## 年齡分級（草稿）

- Apple 年齡分級問卷：沒有暴力、性、成人主題、賭博、醫療資訊；沒有不受限的網頁瀏覽；沒有私訊或聊天；
  有使用者產生的內容（暱稱會顯示給配對到的陌生對手）；沒有廣告。
- Google（IARC 問卷）：類別選遊戲；使用者可以互動（線上對戰與暱稱），不分享位置，沒有數位購買。
- 暱稱沒有過濾、檢舉或封鎖功能（Apple 1.2 可能要求）；先不做，被退件再補。

## 給審核員的說明（App Review Notes）

> No sign-in is needed.
> Single device: on the lobby tap "Challenge AI" → "Play now" to play a full game against the AI.
> Online play needs a second player: tap "Play with friends" → "Create private room" on this device
> and enter the room code with "Join room" on a second device — or open https://connect4.oraclelee.com
> in any browser as the second player. Random matching works the same way with two players.
>
> 不需要登入。一台裝置就能測：大廳點「挑戰 AI」→「立即對戰」下完一局。線上對戰需要第二位玩家：
> 在這台點「和朋友一起玩」→「建立私人房」，第二台裝置用「加入房間」輸入房間代碼；第二位玩家也可以
> 用任何瀏覽器開 https://connect4.oraclelee.com 。隨機配對同樣需要兩位玩家。

## Google Play 特有

- 新的個人開發者帳號：正式版上架前，必須有 12 位測試者連續 14 天參與封閉測試。測試者來源**待決定**。
- 第一次的 AAB 要在 Play Console 手動上傳（Mobile release 的 `android-aab` artifact）。
- 商店圖示：`mobile/store/play-icon-512.png`（512×512、32 位元 PNG）。

## 商店素材（待辦，行銷時再做）

- App Store：至少一組 6.9 吋 iPhone 截圖。只支援 iPhone，不需要 iPad 截圖。
- Google Play：至少 2 張手機截圖，以及 1024×500 的主題圖片（feature graphic）。
- 簡介、關鍵字、宣傳文字。
