# 邀請連結能不能在有裝 app 的手機上直接打開 app：可行性研究

- 日期：2026-10-16
- 負責：connect4-mobile（整體技術設計與 iOS；這份筆記只整理依據，程式改動見同一個 PR）
- 問題：使用者原話「我從APP分享到LINE或是IG給也有下載這個APP的人玩時，它點開會是網站不會自動導引到APP耶」。
  使用者 2026-10-16 選「三塊都做」：iOS Universal Links、LINE 的 openExternalBrowser 參數、網站邀請頁的
  「用 App 開啟」按鈕。

## 先說結論

1. **做得到。** iOS 的 Universal Links 正是為了「同一個 https 網址，有裝 app 就開 app、沒裝就開網站」而設計
   的。網站要提供 `apple-app-site-association`（AASA），app 要宣告 Associated Domains。
2. **app 端不用改 Swift。** main 的 `SceneDelegate` 已經把三條入口都交給 Capacitor：冷啟動
   （`willConnectTo`）、執行中（`continue userActivity`）和自訂 scheme（`openURLContexts`）。
   `@capacitor/app` 把它們變成網頁收得到的 `appUrlOpen`。
3. **兩個限制決定了設計：**
   - 在 Safari 裡點**同網域**的連結會留在 Safari，所以網站上的「用 App 開啟」按鈕不能用同網域的 https
     連結，改用自訂 scheme。
   - 裝置大約**一週**才更新一次 AASA，所以網站一定要比 app 先上線，而且內容要一次就對。
4. **網址改成 `/r/CODE`**（取代 `/?room=CODE`）。用路徑比對不受 `openExternalBrowser=1` 這類查詢參數影響，
   可以少跑幾輪「出 TestFlight → 實機測試」。舊的 `/?room=` 在網站上照常可用。
5. **Universal Link 本身只能用實機驗證。** CI 的模擬器 build 沒有簽章，不會帶 entitlement；Apple 的
   developer mode 只給 development 描述檔簽的 app 用，我們的 TestFlight 用不到（附錄來源 5）。

## 名詞

- **Universal Link**：一般的 https 網址。iOS 確認網站和 app 互相認領之後，點它就直接開 app。
- **AASA**：放在網站 `/.well-known/apple-app-site-association` 的 JSON 檔，寫明哪個 app 可以開哪些網址。
- **Associated Domains**：app 的權限（entitlement），列出它認領的網域，例如 `applinks:connect4.oraclelee.com`。
- **自訂 scheme**：只有這個 app 認得的網址開頭，例如 `oraclelee-fourinarow://r/ABC123`。

## 1. Apple 的規則（官方原文）

| 主題 | 原文 | 對我們的影響 |
|---|---|---|
| 檔案位置 | `https://<fully qualified domain>/.well-known/apple-app-site-association`，檔名「(without an extension)」 | back 在 FastAPI 的萬用路由前面明確註冊這個路徑 |
| 主機要求 | 「You must host the file using `https://` with a valid certificate and with no redirects.」 | 不能轉址；目前這個路徑回的是 SPA 的 HTML（200 text/html） |
| 誰來抓 | 「apps no longer send requests for `apple-app-site-association` files directly to your web server. Instead, they send these requests to an Apple-managed content delivery network (CDN)」 | 要確認 Cloudflare 沒有擋 Apple 的 CDN |
| 多久更新 | 「Apple's content delivery network requests the … file for your domain within 24 hours. Devices check for updates approximately once per week after app installation.」 | 網站先上線；內容錯了，裝置要等大約一週才會更新 |
| 比對規則 | `?`「Matches any single character」；「A match occurs when a URL matches all the components that a `components` object specifies.」；`?` 鍵的預設值是 `*` | `"/": "/r/??????"` 剛好比對 6 碼，查詢參數不影響比對 |
| 同網域 | 「When a user browses your website in Safari and taps a universal link in the same domain, the system opens that link in Safari … If the user taps a universal link in a different domain, the system opens the link in your app.」 | 網站上的按鈕改用自訂 scheme |
| 會開 app 的地方 | 「within their browser app and [WKWebView], and when they click links that result in a call to `open(_:options:completionHandler:)`」 | LINE 加 openExternalBrowser 之後很可能會開 app，要實機確認 |
| 自訂 scheme | 「universal links are strongly recommended」；「it doesn't prevent other apps from registering the same scheme」 | scheme 只用在網站按鈕；取一個不容易撞名的名字 |
| 參數驗證 | 「make sure to validate all URL parameters and discard any malformed URLs」 | front 用 `roomCodeFrom`（`^[A-Z0-9]{6}$`）驗證房號 |

## 2. 設計

### AASA（back 提供）

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["J89WNJYJ63.com.oraclelee.connect4"],
        "components": [
          { "/": "/r/??????", "comment": "Invite links /r/ABC123 (any query) open the app" },
          { "/": "/", "?": { "room": "??????" }, "comment": "Older /?room=ABC123 links, best effort" }
        ]
      }
    ]
  }
}
```

- `J89WNJYJ63` 是 Team ID，也就是 App ID Prefix，由使用者在 Apple 開發者網站確認。AASA 本來就是公開的，
  所以寫進 repo 沒有問題。
- 只有邀請網址會開 app；首頁和其他路徑都留在網站。

### app（mobile，這個 PR）

- `mobile/ios/App/App/App.entitlements`：`com.apple.developer.associated-domains` =
  `applinks:connect4.oraclelee.com`。Debug 和 Release 都設定 `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`。
- `Info.plist` 的 `CFBundleURLTypes` 加上 scheme `oraclelee-fourinarow`，給網站的「用 App 開啟」按鈕用。
- `@capacitor/app` 8.1.2，frontend 和 mobile 都鎖這個精確版本。
- Android：只加這個 plugin，不加 intent filter，也不做 App Links（等上 Google Play 時再做）。設定
  `plugins.App.disableBackButtonHandler = true`。這個 plugin 預設會在頁面無法返回時吃掉返回鍵，設成
  true 才能維持 Android 現在按返回鍵的行為。

### 網站（front）

- `appUrlOpen` 和 `getLaunchUrl`（Android 冷啟動用）都接，並去重。一個解析器同時處理三種網址：
  `/r/CODE`、`r/CODE`（scheme）和舊的 `?room=CODE`，都導到該房間的邀請頁。
- `inviteUrl()` 改成產生 `/r/CODE`，分享連結和 QR 都用這個格式；網站新增 `/r/:code` 路由。
- 分享出去的連結加上 `openExternalBrowser=1`（QR 不加），網站讀完房號後就從網址列拿掉。
- 使用者 2026-10-16 選「推下載，但保留網頁玩」：
  - 邀請頁的「用 App 開啟」按鈕連到 `oraclelee-fourinarow://r/CODE`，沒裝 app 時帶到 App Store 下載頁；
  - 網站加 Smart App Banner（`apple-itunes-app`，app-id 6816204087）；
  - 「加入房間」照樣可以在網頁玩。
  畫面要先由 ui 出稿、使用者核准。

## 3. 對現有架構的影響

- **簽章**：App ID 要勾選 Associated Domains，App Store 描述檔要重新產生，`IOS_PROFILE_BASE64` 要更新。
  沒做的話，封存會失敗；Mobile release 在封存後也會用 `codesign` 再檢查一次 entitlement。
- **Cloudflare**：Apple 的 CDN 要抓得到 AASA。部署後用附錄的指令確認。Bot Fight Mode「cannot bypass or
  skip … using WAF custom rules」，真的被擋就只能關掉 Bot Fight Mode，或付費改用 Super Bot Fight Mode；
  這要使用者決定。
- **隱私**：沒有收集新的資料，`PrivacyInfo.xcprivacy` 不用改。

## 4. 建議與分階段

1. back：AASA 路由、測試、部署。部署後確認 Apple CDN 回 200。
2. mobile（這個 PR）和 front（deepLink PR）一起合併。
3. 使用者：在 App ID 勾 Associated Domains、重新產生描述檔；mobile 更新 secret。
4. 發 3.4.0，跑 Mobile release，出 TestFlight。
5. 使用者實機測試：訊息、備忘錄、Safari（從其他網站點）、LINE 加參數和不加參數、IG，有裝和沒裝 app 各測。
6. ui 出按鈕稿 → 使用者核准 → front 實作（只改網站，不用重新送審）。
7. 送審。

**不建議**：

- 用第二個網域（play.oraclelee.com）做按鈕。要加 DNS、nginx，app 要多認領一個網域；使用者選了自訂 scheme
  並且不保留這個網域。
- 在 Safari 用同網域的 https 連結做按鈕。依官方原文，同網域的連結會留在 Safari。

## 附錄

### 驗證指令

```bash
# 網站上的 AASA：200、application/json、沒有轉址
curl -sS -o /dev/null -w "%{http_code} %{content_type} redirects=%{num_redirects}\n" \
  https://connect4.oraclelee.com/.well-known/apple-app-site-association
# Apple CDN 上的版本（失敗時看 Apple-Failure-Reason 標頭）
curl -sD- https://app-site-association.cdn-apple.com/a/v1/connect4.oraclelee.com
# 封存後的 app 有沒有帶到網域（macOS）
codesign -d --entitlements - --xml App.app | grep applinks:connect4.oraclelee.com
```

2026-10-16 部署前的狀態：網站這個路徑回 `200 text/html`（SPA 的 index.html）；Apple CDN 回 404，標頭是
`Apple-Failure-Reason: SWCERR00401 Bad JSON content`，同時帶 `Apple-Failure-Details: {"cause":"Connection failed"}`。

2026-10-18 部署 3.3.3 之後：網站這個路徑回 `200 application/json`、沒有轉址；Apple CDN 回 200，
`Apple-From` 是我們網站的這個路徑，內容就是上面的 AASA（`J89WNJYJ63.com.oraclelee.connect4`，比對 `/r/??????`
和 `/?room=??????`）。Cloudflare 沒有擋 Apple 的 CDN。

### 限制

- 以下幾點都沒有官方說明，只能用實機測試回答：LINE 的 openExternalBrowser 在 iOS 上是交給
  `UIApplication.open` 還是直接開 Safari；IG 的內建瀏覽器會不會依 Universal Link 或自訂 scheme 開 app。
- 這份筆記沒有量測數字，因為這個題目的不確定點都在實機行為，不在效能。

### 來源

1. Apple, *Supporting associated domains*（developer.apple.com/documentation/xcode/supporting-associated-domains）
2. Apple, *Allowing apps and websites to link to your content*
3. Apple, *Supporting universal links in your app*
4. Apple, *applinks*、*applinks.Details*、*applinks.Details.Components*
5. Apple, *Associated Domains Entitlement*（alternate modes：「only apps that you sign with a development profile can use developer mode」）
6. Apple, *Defining a custom URL scheme for your app*
7. Capacitor, *Deep Links* guide 與 *App* API（`appUrlOpen`、`getLaunchUrl`）；`@capacitor/ios` 8.5.2 原始碼 `CAPSceneDelegateProxy.swift`
8. LINE Developers, *Using LINE features with the LINE URL scheme* →「Opening a URL in an external browser」
9. Cloudflare, *Universal SSL limitations*、*Bot Fight Mode*

Apple 的頁面是 2026-10-16 從 developer.apple.com 的 DocC JSON（`/tutorials/data/documentation/<path>.json`）讀取的。
