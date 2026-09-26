# 送審清單（3.2.0 草稿）

App Store 與 Google Play 後台要填的內容，依 3.2.0 的程式寫成。填寫前由 ceo 對照程式與 `PRIVACY.md`
再確認一次；標「待決定」的要先問使用者。**按下「送審」一定要等使用者點頭。**

## 共用資料

| 欄位 | 內容 |
|---|---|
| App Store 商店名稱 | 英文「Four In A Row: Super AI」（已建立 app 記錄；「Four In A Row」已被別的 app 使用）。繁中「四子棋」填中文資料時才知道能不能用 |
| 手機桌面名稱 | 不變：中文（繁、簡）「四子棋」，其他語言「Four In A Row」 |
| 主要語言 | English (U.S.)：沒有翻譯的語言會顯示主要語言；再加繁體中文 |
| Bundle ID／Package | `com.oraclelee.connect4` |
| 版本 | 3.2.0。App Store 版本頁預設的「1.0」要改成 3.2.0，才選得到上傳的建置 |
| 類別 | 遊戲 → 棋盤遊戲（Board） |
| 隱私權政策網址 | https://github.com/EdwardLeeee/connect4-web2/blob/main/PRIVACY.md |
| 支援網址（App Store 必填） | https://github.com/EdwardLeeee/connect4-web2/issues |
| 需要登入 | 否，沒有帳號 |
| 廣告／App 內購買 | 無 |
| 價格 | 免費 |
| 加密出口規範 | 只用系統的 HTTPS；Info.plist 已設 `ITSAppUsesNonExemptEncryption = false`，上傳時不用再回答 |

**名稱被占用**：App Store 的名稱全站唯一。中文名稱若被占用，停下來回報 ceo，由使用者另取，不要自己改名。

**商標**：畫面上仍有 CONNECT 4 字樣（Hasbro 的註冊商標）；使用者已接受可能因 Apple 5.2.1 被退件的風險。

## 3.2.0 手機上存了什麼（申報依據）

| 資料 | 存在哪裡 | 會不會傳到伺服器 |
|---|---|---|
| 連線代碼（session token） | 手機（Preferences） | 會，每次連線用來辨識 |
| 上次的暱稱與語言 | 手機（Preferences），沒網路時也能顯示 | 會，連上時用 `PATCH /api/session` 補回伺服器（3.2.0 之前就會送） |
| 第一次打開產生的預設暱稱（「玩家 NNNN」／「Player NNNN」） | 手機 | 第一次連上時送出，之後和上一列相同 |
| AI 對局進度與比分 | 手機（Preferences） | 不會；AI 在手機上算，連網時也一樣 |

iOS 的 Preferences 是 UserDefaults，可能跟著使用者自己的 iCloud／裝置備份；Android 已設
`allowBackup=false` 並排除備份。刪掉 app 就會清掉這些資料。

## App Store：App Privacy（草稿）

**結論：3.2.0 不用改申報。** 依據：Apple 的定義，「收集」是指資料離開裝置、讓開發者或第三方能保存超過
即時處理所需的時間。只存在手機上的資料（AI 對局、預設暱稱在送出前）不算收集。會送到伺服器的暱稱、語言與
連線代碼，3.2.0 之前就已經送，申報維持原樣：

- 是否收集資料：**是**。
- Identifiers → **User ID**：伺服器用一組隨機代碼辨識連線。用途：App Functionality。
- User Content → **Other User Content**：暱稱，會顯示給同一局的對手。用途：App Functionality。
- 兩項都**不用於追蹤**；「與使用者身分連結」填**否**（沒有帳號，代碼隨機產生，資料只在伺服器記憶體、
  重啟就清除）。這是判斷題，送出前請 ceo 確認。
- 語言是介面設定，不另列資料類型。若要最保守，可以加 Other Data Types → App Functionality，但不影響結果。
- 伺服器與 Cloudflare 的連線紀錄（IP 等）只用於維運與安全；App Privacy 沒有對應的「IP 位址」類型，
  也沒有用它推算位置，所以不另外申報。

`mobile/ios/App/App/PrivacyInfo.xcprivacy` 也**不用改**：它宣告的 UserDefaults 理由碼 CA92.1
（app 讀寫自己的資料）涵蓋所有 Preferences 用途；收集的資料類型與上面一致。改答案時兩邊要一起改。

**App Privacy 只能在網頁上填**：App Store Connect API 沒有這一項（fastlane 的上傳功能也要用 Apple ID
密碼登入網頁，我們不這麼做）。

## Google Play：Data safety（草稿）

**結論：3.2.0 不用改申報。** 依據：Google 的定義，只在裝置上處理、不傳給開發者的資料不算收集。

- 是否收集或分享必須申報的使用者資料：**收集，不分享**。Cloudflare 是代表我們處理資料的服務商，
  依 Google 的定義不算分享。
- 傳輸加密：**是**（HTTPS／WSS）。
- 刪除方式：沒有帳號，伺服器上的資料在重啟時自動清除；刪除 app 就清掉手機上的資料。
- 資料類型：
  - Device or other IDs：隨機連線代碼。收集，必要，用途 App functionality。
  - App activity → Other user-generated content：暱稱（預設「玩家 NNNN」／「Player NNNN」，可改）。
    收集，必要，用途 App functionality。
- 目標對象（Target audience）：**13 歲以上**（ceo 的預設，使用者沒意見就照這個）。不勾 13 歲以下，
  就不適用 Families 政策。「是否可能吸引兒童」一題照實回答；畫面有可愛貼紙，若 Google 判定會吸引兒童，
  再回報 ceo。

## 年齡分級（草稿）

- **Apple**：2025 年改版的問卷（新分級 4+、9+、13+、16+、18+），在 App Store Connect 的 App Information
  頁填，建議直接在網頁上答：
  - 暴力、性、成人主題、賭博、醫療或健康、恐怖題材：全部沒有。
  - 使用者產生的內容：**有**（暱稱會顯示給配對到的陌生對手）；沒有私訊或聊天，也沒有社群動態。
  - 不受限的網頁瀏覽：沒有（唯一的外部連結是隱私權政策，用 Safari 開）。
  - 廣告：沒有。家長控制、年齡驗證：沒有。
  - 分級由問卷算出，填完把結果回報 ceo。
- **Google**（IARC 問卷）：類別選遊戲；使用者可以互動（線上對戰與暱稱），不分享位置，沒有數位購買。
- 暱稱沒有過濾、檢舉或封鎖功能（Apple 1.2 可能要求）；先不做，被退件再補。

## 給審核員的說明（App Review Notes）

內容在 `mobile/store/app-store/review_notes.txt`（唯一來源，中英並列）：不需要登入、第一次打開就有預設名字、
AI 對局在手機上算（可以開飛航模式測）、線上對戰要第二位玩家和網路。改內容請改那個檔案。

聯絡資訊（姓名、電話、email）審核必填，由使用者提供；上傳腳本執行時才輸入，不寫進 repo。

## App Store Connect 怎麼填

分成兩部分，送審按鈕一律由使用者自己按：

1. **用 API 上傳**：`mobile/scripts/app_store_metadata.py` 讀 `mobile/store/app-store/`，這個資料夾是
   商店文字、截圖與審核說明的唯一來源（用法見 `docs/mobile-release.md`）：
   - 版本號改成 3.2.0，選好要送審的建置。
   - 英文與繁中的商店文字：名稱、副標題、簡介、關鍵字、宣傳文字、支援網址、隱私權政策網址。
   - 截圖（`screenshots/<語系>/`，ui 的草稿經使用者核准後放進來）。
   - 給審核員的說明與聯絡資訊。
   - 預設只做 dry-run，印出會送出的內容；`status.json` 是 `approved` 且必填欄位都有內容才能真的上傳。
2. **使用者照指南在網頁上填**（API 沒有或不適合）：App Privacy、年齡分級問卷、價格與上架地區，
   以及最後的「新增以供審查／提交審查」。mobile 在對話裡一步步帶。

## Google Play 特有

- 新的個人開發者帳號：正式版上架前，必須有 12 位測試者連續 14 天參與封閉測試。帳號與測試者由 ceo 問使用者。
- 第一次的 AAB 要在 Play Console 手動上傳（Mobile release 的 `android-aab` artifact）。
- 商店圖示：`mobile/store/play-icon-512.png`（512×512、32 位元 PNG）。

## 商店素材（ui 準備草稿，使用者核准後上傳）

App Store 的文字與截圖都放在 `mobile/store/app-store/`，目前是草稿（`status.json` 為 `draft`，待使用者核准）；
使用者核准定稿後，由 ui 把最後的內容寫進去並把狀態改成 `approved`。

- App Store：6.9 吋 iPhone 截圖（1320×2868、1290×2796 或 1260×2736），至少 1 張、最多 10 張。只支援
  iPhone，不需要 iPad 截圖。
- 英文與繁中的副標題（30 字元）、簡介（4000 字元）、關鍵字（100 字元，用逗號分隔）、宣傳文字（170 字元）。
  名稱、副標題、關鍵字不能出現 Connect 4（Hasbro 商標、Apple 2.3.7）。
- Google Play（之後另外準備）：手機截圖 2～8 張、1024×500 的主題圖片（feature graphic）、簡短說明（80 字元）
  與完整說明。
