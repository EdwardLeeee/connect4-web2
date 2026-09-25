# iPhone 版上架前的蘋果帳號設定

收到 Apple Developer Program 的開通確認信之後做一次，大約 20 分鐘。你要做的是在蘋果的網站上點幾個
按鈕、下載 3 個檔案、抄 3 個代碼；其餘（轉檔、存進 GitHub、上傳 app）由 mobile 處理。

**開始前**

- 用你加入會員的 Apple ID 登入（會要求兩步驟驗證）。
- 網頁上方如果出現「需要同意新版協議」的橫幅，先按進去同意，不然後面的按鈕會是灰的。
- 下載的檔案都留在瀏覽器預設的「下載」資料夾（這台電腦是 `~/Downloads`），不用搬。
- 先跟 mobile 說「要開始了」。mobile 會先產生一個「憑證請求檔」`FourInARow.certSigningRequest`
  放進 `~/Downloads`，第 2 步會用到。這個檔不是秘密。

## 1. 登記 app 的身分（App ID）

告訴蘋果「com.oraclelee.connect4 這個 app 是我的」。

1. 開 https://developer.apple.com/account/resources/identifiers/list
2. 按「Identifiers」標題旁的藍色 **＋**。
3. 選 **App IDs** → **Continue** → 選 **App** → **Continue**。
4. **Description** 填 `Four In A Row`；**Bundle ID** 選 **Explicit**，填 `com.oraclelee.connect4`
   （一字不差，上傳後就永遠不能改）。
5. 下面一長串 Capabilities 都不用勾 → **Continue** → **Register**。

## 2. 建立發布憑證（Apple Distribution）

證明「這個 app 是你簽出來的」。

1. 開 https://developer.apple.com/account/resources/certificates/list
2. 按「Certificates」標題旁的 **＋**。
3. 選 **Apple Distribution** → **Continue**。
4. 按 **Choose File**，選 `~/Downloads/FourInARow.certSigningRequest` → **Continue**。
5. 按 **Download**。檔案（通常叫 `distribution.cer`）會存到 `~/Downloads`。

## 3. 建立描述檔（Provisioning Profile）

把「app 身分」和「發布憑證」綁在一起。

1. 開 https://developer.apple.com/account/resources/profiles/list
2. 按「Profiles」標題旁的 **＋**。
3. 在 **Distribution** 底下選 **App Store Connect** → **Continue**。
4. **App ID** 選 `Four In A Row (com.oraclelee.connect4)` → **Continue**。
5. 勾第 2 步建立的 Apple Distribution 憑證 → **Continue**。
6. **Provisioning Profile Name** 一定要填 `Four In A Row App Store`（大小寫、空白都要一樣，
   程式會用這個名字找它）→ **Generate**。
7. 按 **Download**。檔案（類似 `Four_In_A_Row_App_Store.mobileprovision`）會存到 `~/Downloads`。

## 4. 開通並建立 App Store Connect API 金鑰

讓 GitHub 能替你把 app 上傳到 TestFlight，不用每次輸入 Apple ID 密碼。

1. 開 https://appstoreconnect.apple.com/access/integrations/api
   （也可以從 App Store Connect 首頁 → **Users and Access** → 上方 **Integrations** 分頁 →
   左邊 **App Store Connect API** → **Team Keys**）。
2. 第一次會看到 **Request Access**：按下去、同意條款。通常會立刻開通。
3. 按 **Generate API Key**（或表格旁的 **＋**）。
4. **Name** 填 `GitHub Actions`；**Access** 選 **App Manager** → **Generate**。
5. 在新出現的那一列按 **Download API Key** → **Download**。檔案叫 `AuthKey_XXXXXXXXXX.p8`，
   存到 `~/Downloads`。
   **這個檔只能下載一次，也是這幾個檔案裡唯一真正的秘密**：下載後馬上存一份到你的密碼管理器。
6. 抄下兩個代碼：那一列的 **Key ID**（10 碼），以及表格上方的 **Issuer ID**（一長串，含 `-`）。

## 5. 在 App Store Connect 建立 app

這一步才會知道名稱有沒有被別人用掉。

1. 開 https://appstoreconnect.apple.com/apps → 左上角 **＋** → **New App**。
2. **Platforms** 勾 **iOS**。
3. **Name** 填 `Four In A Row`。如果出現「名稱已被使用」，先停下來告訴 ceo，由你另取名字。
4. **Primary Language** 選 **English (U.S.)**。App Store 在沒有翻譯的語言會顯示主要語言，這樣
   「中文顯示四子棋、其他語言顯示 Four In A Row」才會成立；中文名稱「四子棋」之後填商店資料時再加。
5. **Bundle ID** 選 `Four In A Row - com.oraclelee.connect4`。
6. **SKU** 填 `connect4-ios`（只給自己看的代號）。
7. **User Access** 選 **Full Access** → **Create**。

## 6. 抄下 Team ID

1. 開 https://developer.apple.com/account
2. 往下捲到 **Membership details**，抄下 **Team ID**（10 碼英數字）。

## 7. 交給 mobile

跟 mobile 說「好了」，並貼上三個代碼：**Key ID**、**Issuer ID**、**Team ID**。它們不是秘密，
可以直接貼在對話裡。

mobile 接著會：

- 把 `~/Downloads` 裡的 `.cer` 轉成簽章用的 `.p12`；
- 把 `.p12`、描述檔、`.p8` 和三個代碼存成 GitHub secrets；
- 把 `.mobileprovision` 和 `.p8` 從 `~/Downloads` 搬到 `~/.config/connect4-mobile/ios/`
  （只有你的帳號能讀），`~/Downloads` 裡不會留下 `.p8`；
- 在已上線的網頁版本上跑一次 Mobile release，把第一個 iPhone 版本送到 TestFlight。

**請你備份到密碼管理器**：`AuthKey_XXXXXXXXXX.p8`（第 4 步），以及 mobile 完成後
`~/.config/connect4-mobile/ios/` 裡的 `distribution.p12` 和 `p12-password.txt`。
