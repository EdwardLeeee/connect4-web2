# 行動版 app：建置、簽章與發布

「四子棋」（英文 Four In A Row）是把網頁打包進去的 Capacitor app。這份文件說明它怎麼建置、
怎麼簽章、怎麼發布；送審要填的內容見 `docs/mobile-store-checklist.md`。

## 架構

| 項目 | 值 |
|---|---|
| 目錄 | `mobile/`（`capacitor.config.ts`、`android/`、`ios/`） |
| Capacitor | core／cli／android／ios 8.5.2，preferences 8.0.1，share 8.0.2，全部精確版本 |
| Bundle ID／applicationId | `com.oraclelee.connect4`（上傳後永久不能改） |
| 網頁來源 | `webDir: ../frontend/dist`，建置時帶 `VITE_API_ORIGIN=https://connect4.oraclelee.com` |
| 頁面 Origin | iOS `capacitor://localhost`、Android `https://localhost`（後端 `CONNECT4_APP_ORIGINS` 的預設值） |
| iOS | Swift Package Manager、最低 iOS 15、只支援 iPhone、Xcode 26 以上 |
| Android | minSdk 24、compile／targetSdk 36、Java 21 |
| 版本號 | 顯示版本＝`frontend/package.json` 的版本；建置號＝發布 workflow 的 run number |

app 裡的網頁是建置當下凍結的，所以 app 只從已經上線的網頁版本（`v*` tag）發布。改到 app 會打包的
網頁之後，要再發一次 app 才會帶上。

`frontend/` 與 `mobile/` 的 `@capacitor/*` 必須是同一個精確版本。`npm --prefix mobile run check:capacitor`
會檢查這件事；Dependabot 在兩邊都忽略 `@capacitor/*`，升級時兩個 `package.json` 一起改、各自重新
`npm install`。

## 本機建置

```bash
VITE_API_ORIGIN=https://connect4.oraclelee.com npm --prefix frontend run build
npm --prefix mobile ci
(cd mobile && npx cap sync)
```

- Android：需要 JDK 21 與 Android SDK 36，`cd mobile/android && ./gradlew assembleDebug`，
  APK 在 `app/build/outputs/apk/debug/`。
- iOS：需要 Mac 與 Xcode 26 以上，開啟 `mobile/ios/App/App.xcodeproj`。Release 設定使用手動簽章
  （見下方 iOS 段落），在 Mac 上直接跑 Debug 即可。

沒有這些工具時，改由 CI 建置（下一節）。

## 圖示與啟動畫面

來源是 `design/app-icon/` 的三個 SVG（由 `design/tools/app-icon.py` 產生）。原稿改了之後執行：

```bash
npm --prefix mobile run icons
```

腳本直接從向量輸出每個尺寸（不放大點陣圖），產生 iOS 1024 圖示（不透明）、Android 自適應與舊版
圖示、Play 商店用的 `mobile/store/play-icon-512.png`，以及 iOS 與 Android 7～11 的啟動畫面
（紙白底 #fff4dc＋中間棋盤）。Android 12 以上的啟動畫面由系統用 app 圖示與同一個底色顯示。

## CI

### `Mobile`（`.github/workflows/mobile.yml`）

pull request 動到 `mobile/**`、`design/app-icon/**`、`frontend/**`（測試除外）或這兩個 workflow 時執行，
不是必要檢查。

- `android`：建置網頁、檢查 Capacitor 版本與 `npm audit`、`cap sync`、`assembleDebug` 與不簽章的
  `bundleRelease`，上傳 `connect4-debug-apk`（保留 14 天，可直接側載測試；每次建置的 debug 簽章不同，
  換版前要先解除安裝舊的）。
- `ios`：建置模擬器版，檢查 Bundle ID、版本、`ITSAppUsesNonExemptEncryption`、只支援 iPhone、
  三個語系的名稱與隱私清單，再建置一次不簽章的 Release 裝置版；另附模擬器截圖。
- `android-smoke`：只在手動執行（Run workflow，勾選 smoke）時跑。在 API 36 模擬器安裝 debug APK，
  對正式站完整下完一局 AI，並確認 `window.open` 不會讓 app 離開遊戲頁；截圖在 artifact。
  需要正式站已經支援 app 連線（3.1.0 以後，且正式環境設好 `CONNECT4_APP_ORIGINS`）。

### `Mobile release`（`.github/workflows/mobile-release.yml`）

1. 網頁版本照原本流程發布並上線（`scripts/release.sh`，再由 devops 部署）。
2. Actions → Mobile release → Run workflow：「Use workflow from」維持 **main**，`tag` 填 `vX.Y.Z`。
   workflow 用 main 上的流程、建置那個 tag 的程式，所以流程修正也適用於舊 tag。
   或用指令：`gh workflow run mobile-release.yml --ref main -f tag=vX.Y.Z`。
3. `preflight` 確認 tag 與 `frontend/package.json` 一致、正式站 `/api/health` 的版本不低於它，再檢查
   兩個平台的簽章 secrets。缺的平台會顯示「已跳過」，Summary 列出缺哪些。
   正式站在 Cloudflare 後面，Cloudflare 會擋 GitHub runner 的請求（回 403），這時版本檢查會失敗並
   說明原因：自己打開 https://connect4.oraclelee.com/api/health 確認版本後，勾選 `production_checked`
   重新執行（加 `-f production_checked=true`），Summary 會註明這次的版本是人工確認。
4. `android`：用上傳金鑰簽出 AAB，比對簽章指紋等於 repo 變數 `ANDROID_UPLOAD_CERT_SHA256`，
   以 artifact `android-aab` 保留 30 天。
5. `ios`：封存並上傳到 App Store Connect，處理完成後出現在 TestFlight。

## Android 上傳金鑰

Google Play 對新 app 使用 Play App Signing：我們只持有**上傳金鑰**，實際發給使用者的簽章金鑰由
Google 保管。上傳金鑰由 `mobile/scripts/android-upload-key.sh` 產生（只執行一次）：

- keystore 與密碼在 `~/.config/connect4-mobile/android/`（權限 700），不在任何 repo 裡。
  **請另外備份 `upload-keystore.jks` 與 `store-password.txt` 到密碼管理器。**
- GitHub secrets：`ANDROID_UPLOAD_KEYSTORE_BASE64`、`ANDROID_UPLOAD_KEYSTORE_PASSWORD`、
  `ANDROID_UPLOAD_KEY_PASSWORD`。secrets 寫入後讀不回來，不能當備份。
- repo 變數（公開資訊）：`ANDROID_UPLOAD_KEY_ALIAS`（`upload`）與 `ANDROID_UPLOAD_CERT_SHA256`
  （上傳憑證的 SHA-256 指紋）。alias 不放 secret，是因為 GitHub 會把紀錄裡所有和 secret 相同的字
  （例如「upload」）遮成 `***`。
- 遺失上傳金鑰時，可以在 Play Console 申請重設上傳金鑰；遺失本機備份又沒有密碼管理器的副本，就只能走
  這個流程。

## iOS 簽章（買了 Apple Developer 會員後再做）

秘密檔案都放在 `~/.config/connect4-mobile/ios/`（權限 700），經 stdin 存進 GitHub secrets，不需要 Mac。

1. 使用者加入 Apple Developer Program（個人，每年 99 美元）。
2. 產生憑證請求：`mobile/scripts/ios-signing.sh csr`，得到 `distribution.csr`。
3. 使用者在 [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources)：
   1. Identifiers → ＋ → App IDs → App：Bundle ID 選 Explicit，填 `com.oraclelee.connect4`，
      描述填 Four In A Row，不勾任何 capability。
   2. Certificates → ＋ → **Apple Distribution** → 上傳 `distribution.csr` → 下載 `.cer`。
   3. Profiles → ＋ → Distribution **App Store Connect** → 選上面的 App ID 與憑證 → 名稱**必須**是
      `Four In A Row App Store` → 下載 `.mobileprovision`。
4. 把 `.cer` 轉成 `.p12`：`mobile/scripts/ios-signing.sh p12 <下載的.cer>`。
5. 使用者在 [App Store Connect](https://appstoreconnect.apple.com)：
   1. Users and Access → Integrations → App Store Connect API → Team Keys → ＋，角色 **App Manager**。
      **`.p8` 只能下載一次，下載後立刻備份到密碼管理器。** 記下 Key ID 與頁面上的 Issuer ID。
   2. Apps → ＋ → New App：平台 iOS、名稱、主要語言、Bundle ID 選 `com.oraclelee.connect4`、SKU。
      名稱全站不能重複，這一步才會知道「四子棋」或「Four In A Row」有沒有被占用；被占用就回報 ceo。
6. 在 [Apple Developer 帳號頁](https://developer.apple.com/account) 的 Membership details 卡片抄 Team ID。
7. 存成 secrets：
   `mobile/scripts/ios-signing.sh secrets <.mobileprovision> <AuthKey_XXXX.p8> <Key ID> <Issuer ID> <Team ID>`，
   會設定 `IOS_DIST_CERT_P12_BASE64`、`IOS_DIST_CERT_P12_PASSWORD`、`IOS_PROFILE_BASE64`、
   `APPLE_TEAM_ID`、`ASC_API_KEY_ID`、`ASC_API_ISSUER_ID`、`ASC_API_KEY_P8_BASE64`。
8. 對已上線的 `v*` tag 執行 Mobile release，iOS job 不再跳過。

Release 設定寫在 Xcode 專案 App target 裡（`CODE_SIGN_STYLE = Manual`、Apple Distribution、描述檔
`Four In A Row App Store`、`DEVELOPMENT_TEAM = $(C4_APPLE_TEAM_ID)`）。不要改成在 xcodebuild 命令列
傳簽章參數：那會套到 Swift 套件的 target 上而建置失敗。上傳用 `xcodebuild -exportArchive`
（`destination: upload`）搭配 API key，所以 API key 只需要能上傳建置的角色。

## 第一次上架

- Google Play：使用者建立開發者帳號後，在 Play Console 建立 app，第一次的 AAB 要在 Play Console 手動
  上傳（之後才可能用 API）。新的個人帳號必須先讓 12 位測試者連續 14 天封閉測試，才能申請正式版。
- App Store：TestFlight 出現建置後，照 `docs/mobile-store-checklist.md` 填寫並送審。
