# Connect 4 UI 規格：方向 C「粗線派對」（第二階段）

- **狀態**：使用者 2026-09-24 核准，並做了第 0 節列的調整。這份文件和 `design/artboards/round2/` 的 85 張圖（外加一張勝利動畫 GIF）就是 RD 實作的規格、QA 的基準。
  圖只存在本機，不進 git；要看就在本機重現或用 eog 開。
- **方向**：使用者 2026-09-24 選 C，不做亮／暗切換，等待畫面加 QR code 與分享連結。
- **協定**：以 `docs/protocol.md` 為準（connect4-back 已定案）。線上／排隊人數（presence）這一輪不做，畫面上也沒有。
- **原始檔**：
  - `design/mockups/round2/`：
    - `tokens.css`、`base.css`：樣式。
    - `motion.css`：動效。
    - `states.js`：各狀態的 snapshot fixture。
    - `strings.js`：兩種語言的文案。
    - `render.js`、`story.js`：畫面與分鏡的產生程式。
  - 重現步驟：
    ```bash
    python3 -m http.server 8790 --bind 127.0.0.1 --directory design &
    python3 design/tools/round2-jobs.py
    PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright node design/tools/shoot.mjs \
      http://127.0.0.1:8790/ design/artboards/round2 design/tools/round2-jobs.json
    PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright node design/tools/shoot.mjs \
      http://127.0.0.1:8790/ design/artboards/round2 design/tools/storyboard-jobs.json
    ```
- **限制**：
  - 圖是在 Linux 上用 Chromium 算繪的，中文字是 Noto Sans CJK TC；iPhone 上會是 PingFang TC，字寬略有差異。
  - WebKit 在這台機器缺 `libavif13`，所以手機圖也用 Chromium 算。
  - 手機最終驗收要用使用者的 iPhone 14 Pro Max Safari 實測，這一輪不宣稱通過。

## 0. 使用者裁示（2026-09-24）

- **偏離項目**：D1–D10 全部照設計做（使用者說沒特別提的就是沒問題）。
- **AI 名稱**：改叫 **Super AI**。
  - 後端 `manager.py` 裡 AI 的暱稱要跟著改。
  - 等 AI 下子時，狀態列顯示「**AI 正在思考**」。
  - 對局卡上 AI 那一列的標示從「後手 · 精確求解器」改成「**後手 · Super AI**」。
- **AI 思考動效**：AI 幾乎都是立即落子，所以拿掉 AI 的巡行動畫、秒數和長說明。
  - 真人對戰輪到對手時，改成「{name} 正在思考」加三點跳動（A04）。
- **等朋友畫面**：只留一顆按鈕（第三輪）。
  - 桌機是「複製邀請連結」，按過之後一直顯示「已複製邀請連結」，不變回原字。
  - 手機是「分享邀請」，會跳出手機的分享選單。
  - 「複製房號」按鈕拿掉，房號仍用大字顯示（A06）。
- **AI 局結算文案**：改成「挑戰者別氣餒，再挑戰一次？」。
- **真人對戰再來一局**：**顏色不互換，但先後手每局輪流**。
  - 上一局後下的人，下一局先下；每位玩家的顏色整場不變。
  - 使用者 2026-09-24 補充：原本後端固定綠方先手，只取消換色會讓同一個人永遠先手，這不是想要的結果。
  - 後端已改：先手不再綁定綠色，snapshot 用 `game.first`（"green" | "pink"）告訴前端這局誰先手（connect4-back 已定案，見 `docs/protocol.md`）。
  - AI 局不變：玩家一律綠色、先手，結局面板的「再次挑戰」也不換。
- **邀請連結**：打開後進入**專屬邀請頁**（L12），整頁只有一顆大按鈕「加入房間」；按一下才加入，不自動加入。
  - 房間無法加入時，在同一頁說明原因（L13），只有「回到大廳」一顆按鈕。
- **挑戰 AI 的描述**改成「挑戰者，你能想出擊敗 AI 的戰術嗎？」（第三輪）。
- **結局面板**不再沿用棋子顏色（第三輪，選 R1）：
  - 勝：向日葵底加放射光芒，徽章是獎盃。
  - 敗：墨黑底、白字，徽章是旗子。
  - 平：白底，下緣虛線，徽章是等號。
  - 求解器故障：淡黃底加警示圖示。
- **勝利慶祝**加長到約 3 秒（第三輪）：依序是連線棋子彈起、墨線、星星、彩紙、獎盃、結局面板，最後勝利棋子脈動 3 次（A03）。
  - 對手離線判負、對手離開而獲勝時也灑彩紙（使用者 2026-09-24 確認）。這兩種沒有連線，所以只有彩紙、獎盃和結局面板。
- **設計圖檔**：只存本機，不 push。規格與 mockup 原始檔可以進 git。

### 第四輪（2026-09-24，實機驗收後；`docs/briefs/2026-09-24-feedback.md`、`design/round4.md`）

- **桌機右側資訊欄往下對齊**（選 A 整欄下沉）：
  - `.game { align-items: end }`，右欄整體底緣對齊棋盤底緣，上方留白。
  - 矮桌機（1366×768）同樣適用。
- **房號空白按「加入房間」**（新增 L14）：
  - 欄位轉粉紅底加粉紅外環，下方出現「請先輸入房號」／「Enter a room code first」，游標停在欄位裡，開始輸入就消失。
  - **錯誤狀態不顯示綠色焦點框**（使用者要求），只留粉紅外環；L10 的暱稱錯誤也一樣。
- **AI 局結局面板按鈕**改成「再次挑戰」／「Challenge again」，勝、敗、平一律；P12 求解器故障維持「重新開始」。
- **輸入框的焦點框**（使用者 2026-09-24 最新裁示，由 connect4-front 轉達：「選擇的時候框框還是黑的比較好，不要綠色」）：
  - 所有輸入框與選單（房號、暱稱、語言）被選到時是**墨色** 3px 框、間距 2px。
  - 錯誤狀態不加框，只顯示粉紅外環（L14、L10）。
  - 按鈕的焦點框本來就是墨色。
  - 棋盤用鍵盤選欄（A09）也改成純墨色 3px 框，拿掉薄荷外暈；不是你的回合時是灰色框，同樣沒有外暈（使用者 2026-09-24：「好改黑的」）。
  - 英文的刪節號「…」維持原樣，不改成三個句點（使用者 2026-09-24：「看起來是還好可以不用改」）。
- **暱稱空白**（第六輪，使用者 2026-09-24 核准 `design/artboards/round6/`）：
  - 欄位一清空就變成和房號空白一樣的粉紅錯誤樣式，下方顯示「請先輸入暱稱」／「Enter a nickname first」。
  - 「儲存」按鈕停用，開始輸入就恢復（L10）。
- **手機「分享邀請」**只在 HTTPS 正式站出現（iOS Safari 只在安全連線提供系統分享）。區網 http 測試時退回「複製邀請連結」是預期行為，等部署後再驗。

### 第七輪（2026-09-25，第三輪玩家回饋；設計稿 `design/artboards/round7`–`round15`，只存本機）

設計稿都由 `design/mockups/round2/r7-anim.html?opt=…` 產生（`r7.css`、`r7.js`）。下面每一項都寫了對應的 `opt`，front 可以直接打開對照；動畫的時間點以該檔的 keyframes 為準。

- **(02) AI 思考提示**：
  - 輪到 AI 就**立刻**顯示「AI 正在思考」加三點，不再等 300ms（P05、A04）。
  - AI 每手**至少等 1 秒**才落子（後端原本是 0.5 秒，要請 connect4-back 改成 1 秒）。
  - 求解仍是精確解，這個等待不是超時也不是備援。
  - 設計稿：`R8-02-AI思考提示-B3-立刻顯示等1秒`（`opt=think-b&wait=1000`）。
- **(03) 勝利動畫 C5，約 5.5 秒**（取代原本約 3 秒的 A03；`opt=win-c5`，設計稿 `R9-03-勝利動畫-C5-…`）：
  - 0ms：棋盤閃白光並震動 3 下。
  - 450–950ms：連線畫成金線並發光。
  - 1100ms：畫面中央貼上大貼紙（獎盃、「你贏了！」、「連成四子，共 N 手」、「點一下畫面可以跳過」）。
    - 貼紙背後有一圈金色光芒旋轉。
    - 貼紙上下彈兩次。
    - 兩個下角噴出彩紙砲。
  - 3000ms：貼紙縮小，飛進結局面板。
  - 3300ms：結局面板進場，接著獎盃彈出、勝利棋子脈動。
  - 點一下畫面就直接跳到結局面板。
  - 對手離線判負或離開而獲勝時，沒有連線與金線，其餘照播：
    - 貼紙主標仍是「你贏了！」。
    - 副標不用「連成四子，共 N 手」，改用結局面板既有的文案：判負用 `forfeitWinSub`（「對手沒有在 30 秒內回來。」），離開用 `leftSub`（「這局算你獲勝。對手已離開，無法再來一局。」）。
  - C5、F5、T5 都可以點畫面跳過：點一下就直接跳到結局面板；貼紙第三行都顯示 `stickerSkip`（「點一下畫面可以跳過」）。
- **(04) 失敗動畫 F5，約 5.5 秒**（`opt=lose-f5`，設計稿 `R11-04-失敗動畫-F5-…`）：
  - 對手連線照常畫出。
  - 1000ms：你的棋子**保留原色**、往下沉一點，棋盤整體稍微變暗。
  - 900ms 起：全畫面變暗、下雨。
  - 1200ms：中央貼上「委屈小雲」貼紙（「這局輸了」、「{name} 拿下這局」），小雲會下小雨、抽泣。
  - 1550ms：第一道閃電，小雲跟著閃。
  - 2750ms：第二道閃電劈中棋盤，棋盤震動。
  - 3700ms：貼紙飛進結局面板。
  - 4000ms：結局面板進場，雨漸停。
  - 新顏色：雨滴與淚滴用淡藍 `#a8dcff`（只用在這個動畫）。
- **(07) 平手動畫 T5，約 5.5 秒**（`opt=draw-t5`，設計稿 `R15-07-平手動畫-T5-…`）：
  - 250ms 起：盤面棋子由下往上一列列跳一下。
  - 900ms：兩顆大棋子（咬牙、冒汗、用小手抓繩）在畫面中間拔河。舞台寬 `min(960px, 92vw)`，手機也放得下。
  - 繩子中間綁蝴蝶結，地上有黃色中線。
  - 約 2600ms：繩子從中間斷掉、冒星星，兩邊往後跌倒。
  - 1800ms 起：綠粉兩色彩紙飄落。
  - 4300ms：貼上「平手！」貼紙（「繩子都拉斷了，還是分不出輸贏」）。
  - 5000ms：貼紙飛進結局面板。
  - 5300ms：結局面板進場。
- **(06) 邀請頁直接填暱稱**（L12 v2；`screen.html?state=L12&iv2=1`，設計稿 `R8-06-邀請頁填暱稱-新提示文字-*`）：
  - 房號下方有明顯的「你的暱稱」輸入框，預填這台裝置上次的名字（第一次是隨機的「玩家 NNNN」），進頁自動 focus。
  - 下方提示「你的朋友會看到這個名字呦」。
  - 空白時沿用 L10 的粉紅錯誤與「請先輸入暱稱」，「加入房間」停用。
  - 按「加入房間」時先存暱稱再加入。
  - 限制：iPhone Safari 不會自動跳出鍵盤，要點一下欄位。
- **(08) 窄機棋盤：格徑隨螢幕縮小**（選項 A；`screen.html?nb=a`，設計稿 `R11-08-窄機棋盤-A-格徑縮放-*`）：
  - 手機直向的格徑為 `min(48px, (100vw − 28px − 58px) / 7)`，邊距 14、間距 6、內距 9、外框 2 都不變。
  - 棋盤和上方軌道在畫面中**置中**。
  - 390 → 43.4、393 → 43.9、402 → 45.1、≥422 → 48。
  - 欄的觸控寬度最小約 49px，大於 44px。
  - 原本 390／393／402 的手機最右一欄會被切掉 18／15／6px。
- **新文案**（第七輪；邀請頁三句已在 `strings.js`，貼紙文字請一併加進 i18n）：

  | key | zh-TW | en |
  |---|---|---|
  | `inviteBodyName` | 填好你的暱稱，按「加入房間」就開始對戰。 | Fill in your nickname and tap "Join room" to start. |
  | `inviteNameLabel` | 你的暱稱 | Your nickname |
  | `inviteNameHint` | 你的朋友會看到這個名字呦 | Your friend will see this name! |
  | `stickerWin` / `stickerWinSub` | 你贏了！／連成四子，共 {n} 手 | You won! / Four in a row in {n} moves |
  | `stickerLose` / `stickerLoseSub` | 這局輸了／{name} 拿下這局 | You lost this one / {name} takes this one |
  | `stickerDraw` / `stickerDrawSub` | 平手！／繩子都拉斷了，還是分不出輸贏 | It's a draw! / The rope snapped and still no winner |
  | `stickerSkip` | 點一下畫面可以跳過 | Tap to skip |
- **A11 失敗動畫、A12 平手動畫**：兩個新動效編號，對應上面的 F5 與 T5；A03 改為 C5。
- **reduced-motion**：以上三個結局動畫都只保留結局面板 120ms 淡入。沒有閃光、震動、雨、彩紙、拔河。

## 1. 怎麼看這套圖

`eog design/artboards/round2/` 會依檔名排序，順序如下：
1. A01–A10：動效分鏡。
2. L01–L13：大廳、個人設定、邀請頁。
3. P01–P18：對局。

檔名格式是 `{ID}-{路由}-{狀態}-{viewport}.png`。viewport 有以下幾種：

| viewport | 尺寸 | 用途 |
|---|---|---|
| desktop | 1440×900 | 主要桌機 |
| desktop | 1366×768 | 矮桌機 |
| desktop-en | 1440×900 | 英文桌機 |
| tablet | 768×1024 | 平板（只出 L03） |
| mobile | 430×932 | iPhone 14 Pro Max PWA standalone。上 59px、下 34px 是 safe area，畫了動態島與 home indicator |
| mobile-en | 430×932 | 英文手機（L02、L07、L12、P06、P10、P11、P12、P15：最長的英文文案） |
| keyboard | 430×932 | 鍵盤彈出（只出 L10） |
| safari | 430×739 | Safari 工具列展開後的可見高度（L04、P03、P07）。739 是假設值，要實機確認 |
| landscape | 892×412 | Galaxy S26 Ultra 橫向（L04、P03、P04、P07） |

## 2. Design tokens（`tokens.css`，可直接搬進 `frontend/src/styles.css` 的 `:root`）

| 類別 | token | 值 |
|---|---|---|
| 底 | `--paper` / `--paper-dot` | `#fff4dc`，加 20px 點陣 `rgb(226 196 130 / 55%)` |
| 墨 | `--ink` / `--muted` | `#1b1b1f` / `#5d584f` |
| 棋盤 | `--sun` / `--sun-soft` | `#ffd23f` / `#fff0b3` |
| 綠棋 | `--mint` / `--mint-soft` | `#3ddc97` / `#c8f5df`（原 `#66d3a3`） |
| 粉棋 | `--pink` / `--pink-soft` | `#ff5fa2` / `#ffd3e6`（原 `#f38fae`） |
| 其他 | `--online` / `--disabled` / `--scrim` | `#1fae6c` / `#d9d2c3` / `rgb(27 27 31 / 45%)` |
| 線 | `--bw` / `--bw-thin` | 桌機 3px、手機與橫向 2px / 2px |
| 圓角 | `--r-card` / `--r-btn` / `--r-input` / `--r-board` | 20（手機 18）/ 15 / 13 / 24（手機 18） |
| 硬陰影 | `--sh-card` / `--sh-btn` / `--sh-board` | 桌機 6/4/8px、手機 4/3/5px，都是 `x y 0 var(--ink)` |
| 字級 | `--fs-*` | 11、12、13、15、17、19、22、28、40、56 |
| 曲線 | `--ease-out` / `--ease-in` / `--ease-back` | `(.2,.8,.2,1)` / `(.55,0,1,.45)` / `(.34,1.56,.64,1)` |
| 時長 | `--dur-fast` / `--dur-base` / `--dur-slow` | 120 / 180 / 320ms |

**字體**
- 拉丁字母與數字用 Space Grotesk。自架拉丁子集，一個可變字重檔 22KB（`design/fonts/SpaceGrotesk-700-latin.woff2`，OFL 授權），`font-display: swap`。
- 中文一律用系統字，不載入中文 webfont。
- 品牌字仍是桌機 22px、手機直向 20px，但字型改成 Space Grotesk 700。

**色弱辨識**
- 綠棋有同心圓，粉棋有兩條斜線，花紋一律用墨色。
- 預覽棋子用虛線外框加半透明底。
- 勝利棋子加白邊和墨邊。
- 上一手在棋子外加一圈墨框。

## 3. 版面與尺寸

| 情境 | 條件 | 棋盤格徑／間距／內距 | 棋盤外框 | 其他 |
|---|---|---|---|---|
| 桌機 | ≥901px | 84 / 12 / 14 | 3px | 內容最大寬 1120；棋盤欄 694 + 側欄 352；頂列 58 |
| 矮桌機 | ≥901px 且高度 ≤820px | 68 / 10 / 12 | 3px | 結束畫面的側欄不顯示資訊卡（上一手已標在棋盤上） |
| 平板 | 621–900px | 76 / 10 / 12 | 3px | 大廳改兩欄，AI 卡整列橫放 |
| 手機直向 | ≤620px | `min(48, (100vw − 86) / 7)` / 6 / 9 | 2px | 左右邊距 14，大廳 20；頂列 52；棋盤垂直置中、左右置中（第七輪 08）；離開按鈕固定在底部拇指區 |
| 手機矮視窗 | ≤620px 且高度 ≤780px | 同手機 | 同上 | 間距縮小，結束時不顯示軌道；對應 Safari 工具列展開 |
| 橫向手機 | 橫向且高度 ≤500px | 56 / 5 / 8 | 2px | 棋盤貼左、佔滿高度；狀態籤移到右欄頂端；頂列縮成右上角的品牌 mark 和頭像 |

**對局區由上到下**
1. **狀態籤**：貼紙樣式，旋轉 −1.5°。右側是手數籤。
2. **落子軌道**：高度為一個格徑加 18px。輪到自己時，手上的棋子浮在指到的欄上方。
3. **棋盤**。

**桌機側欄由上到下**（整欄底緣對齊棋盤底緣，第四輪）
1. 結局面板（只在結束時出現）。
2. 對局卡：模式籤、雙方、比分。
3. 資訊卡：先手、上一手。
4. 按鈕。
5. 鍵盤提示。

**手機**
- 由上到下：對局卡縮成一條，接著是棋盤，最後是結局面板或離開按鈕。
- 手機不顯示資訊卡：先後手已寫在對局卡，上一手標在棋盤上。

**觸控與溢位**
- 觸控目標一律 ≥44px。
- 桌機主要按鈕高 56；手機一般按鈕剛好 48（上下 padding 9px、2px 框、17px 字）。
- 手機大廳的「立即對戰」大按鈕是 56。
- 等朋友畫面的文字按鈕「離開」至少 44。
- profile 欄位高 48、字級 16。
- 85 張圖（外加一張勝利動畫 GIF）的水平溢位全部是 0。

## 4. 頁面 × 狀態（觸發條件以 snapshot 判斷）

| ID | 狀態 | 何時出現 | 重點 |
|---|---|---|---|
| L01 | 大廳（zh） | `room == null && !queue.searching` | 桌機兩欄：左邊是「挑戰 AI」大卡，內含會演示的迷你棋盤；右邊依序是朋友卡、配對卡。沒有 hero 或標語 |
| L02 | 大廳（en） | 同上，`locale = en` | 確認英文長度（桌機、手機各一張） |
| L03 | 大廳平板 | 621–900px | AI 卡整列橫放，朋友卡與配對卡並排 |
| L04 | 手機大廳（收合） | ≤620px | AI 卡常駐展開；朋友、配對是手風琴，一次只開一個 |
| L05 | 展開朋友卡 | 手機點朋友卡 | 展開後 AI 卡收起迷你棋盤與說明，讓展開內容留在畫面內 |
| L06 | 展開配對卡 | 手機點配對卡 | 同上 |
| L07 | 大廳離線 | `connection = offline` | 頂列顯示連線狀態；下方加一條粉紅橫幅；所有開始按鈕停用，以斜紋表示 |
| L08 | 錯誤 toast | `error` 事件 | 粉紅貼紙 toast，有 44px 關閉鈕；桌機在右下，手機橫跨底部 |
| L09 | 個人設定（桌機 modal） | 點頭像 | 欄位高 48，語言用原生 select 加自畫箭頭 |
| L10 | 個人設定：暱稱空白 | 暱稱欄位清空或只剩空白時（輸入當下就判斷） | 欄位粉紅底加粉紅外環（沒有綠框），下方「請先輸入暱稱」，「儲存」停用（灰色斜紋）；開始輸入就恢復。桌機是 modal，手機是底部 sheet，鍵盤彈出時 sheet 貼在鍵盤上方。後端 422 `invalid_nickname` 仍顯示「暱稱需為 1–18 個字。」 |
| L12 | 邀請頁（第七輪 v2） | 網址帶 `/?room=CODE` | 專屬頁：「朋友邀請你一起玩」、房號、**「你的暱稱」輸入框**（預填、進頁 focus、提示「你的朋友會看到這個名字呦」；空白時粉紅錯誤、「加入房間」停用）、一顆大的「加入房間」、文字按鈕「不加入，先去大廳」。**不自動加入** |
| L13 | 邀請頁：無法加入 | 按下加入後收到 `room_not_found`／`room_full`／`host_disconnected` | 同一頁改成警示圖示和原因說明（三種錯誤各有文案：`inviteGoneBody`／`inviteFullBody`／`inviteHostOffBody`），只有「回到大廳」 |
| L14 | 房號空白就按加入 | 按「加入房間」或 Enter 時 trim 後為空 | 欄位粉紅底加粉紅外環（沒有綠色焦點框），下方「請先輸入房號」，focus 欄位，開始輸入就清除；不送 `room.join` |
| P01 | 配對中 | `queue.searching` | 三顆棋子跳動，顯示「已等待 m:ss」和取消按鈕 |
| P02 | 等朋友 | `game.status = waiting` | 大字房號、QR code，加上一顆主要按鈕：桌機是「複製邀請連結」（按過後維持「已複製邀請連結」）；手機是「分享邀請」（`navigator.share`，瀏覽器不支援時改成「複製邀請連結」）；另有文字按鈕「離開」 |
| P03 | 我的回合 | `playing && turn == you` | 軌道上的棋子、欄位亮框、預覽落點、上一手框、鍵盤提示 |
| P04 | 對手回合 | `playing && turn != you` | 狀態籤「{name} 正在思考」加三點跳動；軌道空白；棋盤不接受操作；隨機配對也顯示本場比分 |
| P05 | AI 思考 | `status = thinking`（輪到 AI 立刻顯示） | 狀態籤「AI 正在思考」加三點；AI 每手至少等 1 秒才落子（後端）；沒有秒數、沒有超時 |
| P06 | 對手離線 | `paused`（只在真人局；AI 局沒有斷線倒數，玩家回來就接著下） | 狀態籤「{name} 離線了」；倒數籤；對手頭像外加倒數環與「離線」標 |
| P07 | 勝（私人房） | `finished && winner == you`，`connect_four` | 連線高亮加墨線；結局面板在側欄（手機在棋盤下）；本場比分 |
| P08 | 敗（AI） | `finished && winner != you`，AI 模式 | 「Super AI 拿下這局」、「挑戰者別氣餒，再挑戰一次？」和「再次挑戰」（AI 局勝、敗、平的按鈕都是「再次挑戰」） |
| P09 | 平手 | `result_reason = draw` | 面板白底、下緣虛線，徽章是等號；先播 A12 平手動畫（拔河拉斷繩子） |
| P10 | 對手離線判負（你勝） | `forfeit && winner == you` | `rematch_available` 為 true，仍可再來一局；對手顯示離線 |
| P11 | 對手中途離開 | `result_reason = left` | 只有「回到大廳」按鈕 |
| P12 | 求解器故障 | `status = error` | 棋盤蓋上斜紋；說明文字寫明「不會改用較弱的備援 AI」；「重新開始」 |
| P13 | 我已邀請再來一局 | `rematch[you]` | 「已邀請 {name}」「{name} 還沒回應」；主按鈕停用，顯示「等待對手回應…」 |
| P14 | 我離線 | `connection = offline` | 棋盤蓋上斜紋，並顯示「連線中斷，正在重新連線…」 |
| P15 | 已在其他分頁開啟 | close code 4001 | 一顆主要按鈕「在這裡繼續」（front 的 `reclaim()`），加一段說明；不自動搶回 |
| P16 | 自己離線判負 | `forfeit && winner != you` | 「離線逾時，這局判負」；和 P08 的連四敗是不同文案 |
| P17 | 對手邀請再來一局 | `rematch[opponent] && !rematch[you]` | 「{name} 想再來一局！」「按下就開始下一局：顏色不變，這局換 {下一局先手} 先下。」；主按鈕「好，再來一局」 |
| P18 | 分出勝負後對手才離開 | `finished && rematch_available == false && result_reason != left` | 保留原本結果，加註「{name} 已離開房間，無法再來一局」；只有「回到大廳」 |

## 5. 元件

- **按鈕**：
  - 共通樣式：3px 墨框（手機 2px）、硬陰影 4px，按下時位移 3px、陰影縮成 1px。
  - 種類：
    - 主要按鈕：薄荷底。
    - 次要按鈕：白底。
    - 深色按鈕：墨底加粉紅陰影，用在「加入房間」。
    - 文字按鈕：底線樣式，用在等朋友畫面的「離開」。
  - 停用：灰底斜紋、無陰影。
- **卡片**：白底，3px 墨框，圓角 20，硬陰影 6px。
- **棋盤**：
  - 向日葵底，3px 墨框，圓角 24，硬陰影 8px。
  - 空格是紙色，有 3px 墨框和內陰影。
  - 棋子邊緣蓋住空格的邊框（inset −3px），左上有貼紙高光。
- **軌道**：輪到自己時，手上的棋子轉 −10° 並帶 5px 硬陰影，下方有墨色三角箭頭指向欄位。
- **欄位亮框**：半透明白底，2px 墨色虛線，圓角膠囊形。
- **狀態籤**的底色：
  - 自己回合：**跟自己的棋子顏色**，綠方用 `--mint`、粉紅方用 `--pink`（第三輪回饋 (1)，使用者核准、front 已實作 fa0f7c8）。
  - 「{name} 回來了」：一律 `--mint`，不分顏色。
  - 對手回合：白。
  - AI 思考：淡粉。
  - 離線倒數：向日葵；最後 10 秒轉粉紅並脈動。
  - 錯誤：粉紅。
  - 自己離線：灰。
- **結局面板**：
  - 上半是色帶加徽章，**不用棋子的綠／粉紅**：
    - 勝：向日葵放射光芒＋獎盃。
    - 敗：墨黑底白字＋旗子（自己離線判負時換成斷線圖示）。
    - 平：白底＋等號。
    - 故障：淡黃＋警示。
  - 所有文字按鈕（例如邀請頁的「修改」）至少 44×44。
  - 中段是再來一局的狀態列（可選）。
  - 下半是按鈕：桌機直排，手機兩欄並排，主要按鈕在右。
- **對局卡**：
  - 包含模式籤、兩列玩家（輪到的一方有墨框底色）、「對」、本場比分（`series`）。
  - 輪到自己時，自己那一列的底色和「輪到你了」小標籤都跟自己的棋子顏色：
    - 綠方：底色 `--mint-soft`，小標籤 `--mint`。
    - 粉紅方：底色 `--pink-soft`，小標籤 `--pink`。
  - 本場比分在所有真人局都顯示（私人房、隨機配對），只有 AI 局不顯示。
  - 手機直向與橫向時，第二位玩家（粉紅）一律左右鏡像：頭像在右、名字靠右；有沒有比分列都一樣。
  - 私人房的房號寫在模式籤上。
- **QR 卡**：白卡轉 2°，QR 用墨色，下方寫「用手機掃描加入」。

## 6. 動效（詳見 A01–A10 分鏡與 `motion.css`）

| ID | 動效 | 時長與曲線 | reduced-motion |
|---|---|---|---|
| A01 | 落子重力＋壓扁＋回彈＋一次小彈 | 260 + 30×下落列數 ms；下落段 ease-in。兩手同時到（例如 AI 立刻回應）時依序掉落，第二顆排隊期間先隱藏；「上一手」框線等棋子落定才出現；A03 慶祝等最後一顆落定後才開始，結局面板等待期間隱藏但保留位置 | 直接出現在落點 |
| A02 | 滑鼠／觸控預覽 | 棋子滑動 140ms；亮框與預覽淡入 100ms | 瞬移；只淡入 120ms |
| A03 | 勝利慶祝 C5（約 5.5 秒，第七輪） | 閃白光＋棋盤震動 0ms；金線 450–950ms 並發光；大獎盃貼紙 1100ms 貼上，背後光芒旋轉、貼紙彈兩下、兩角彩紙砲；3000ms 飛進面板；面板 3300ms；點畫面可跳過（`r7.css` 的 C5 規則） | 只有面板淡入 |
| A11 | 失敗 F5（約 5.5 秒，第七輪） | 棋子保留原色下沉＋棋盤變暗 1000ms；全畫面變暗下雨 900ms 起；小雲貼紙 1200ms；閃電 1550ms、2750ms（第二道劈中棋盤、震動）；貼紙 3700ms 飛進面板；面板 4000ms | 只有面板淡入 |
| A12 | 平手 T5（約 5.5 秒，第七輪） | 棋子一列列跳 250ms 起；大拔河 900ms；繩子斷、跌倒約 2600ms；綠粉彩紙 1800ms 起；「平手！」貼紙 4300ms；飛進面板 5000ms；面板 5300ms | 只有面板淡入 |
| A04 | 思考中（真人對手、AI） | 三點跳動 900ms 循環，每點錯開 150ms；AI 局輪到 AI 立刻顯示（第七輪），AI 每手至少 1 秒 | 三點靜止 |
| A05 | 離線 30 秒倒數 | 30 秒線性；最後 10 秒每 1 秒脈動一次 | 每秒跳一格，不脈動 |
| A06 | 配對跳動、複製回饋 | 跳動 900ms 循環，每顆錯開 150ms；桌機複製彈跳 180ms，之後維持「已複製邀請連結」 | 靜止；只換字 |
| A07 | 大廳 → 對局 | 大廳淡出 160ms，對局升起 240ms，狀態籤彈出 160ms | 交叉淡入淡出 120ms |
| A08 | reduced-motion 總表 | — | — |
| A09 | 鍵盤操作 | 同 A02、A01 | 同 A02、A01 |
| A10 | 大廳迷你棋盤演示 | 6 秒循環；不在畫面內時暫停 | 只顯示第一幀 |

## 7. 資料來源（`docs/protocol.md`）

| 畫面需要的資料 | 欄位 | 說明 |
|---|---|---|
| 手數、上一手 | `game.history` | 長度就是手數；最後一碼是上一手所在的欄，該欄最上面那顆就是上一手 |
| 先後手 | `game.first`（已定案） | 對局卡、資訊卡顯示「先手／後手」；不可再假設綠方先手。`history` 第 i 手的顏色也要從先手顏色推算 |
| 倒數 | `players[c].grace_deadline`、`server_time` | 剩餘秒數 = `grace_deadline − (本機現在 + offset)`；值是 null 時只顯示文字 |
| 再來一局 | `rematch {green, pink}`、`rematch_available` | P13、P17、P18、P10、P11 的按鈕與狀態列；不要用 `result_reason` 推導 |
| 比分 | `series {you, opponent, draws}` | 對局卡底部；AI 模式不顯示 |
| 對手連線 | `players[c].connected` | 「在線」「離線」標籤 |
| 線上人數 | —（這一輪不做） | 大廳與配對畫面都沒有 |
| AI 名稱 | `players[c].nickname`（`is_ai`） | 後端改成 `Super AI` |
| 再來一局的顏色與先手 | 後端 | 真人對戰顏色不變、先後手輪流（使用者裁示）；`docs/protocol.md` 要一起改 |

## 8. 分工

| 項目 | 誰 | 說明 |
|---|---|---|
| 樣式、元件、版面、動效 | front | 以本規格和 85 張圖（外加一張勝利動畫 GIF）為準 |
| 深連結 `/?room=CODE` | front（新路由） | 開啟後顯示專屬邀請頁（L12），按「加入房間」才送 `room.join`；錯誤顯示在同一頁（L13） |
| QR code | front（新依賴） | 候選 `qrcode-generator` 或同級、可產 SVG 的套件；實作時量體積，預估 gzip 後在 10KB 內（未量測）。QR 內容就是深連結 |
| 分享 | front | 手機唯一的按鈕「分享邀請」用 `navigator.share({ title, text, url })`；不支援時同一顆按鈕改成「複製邀請連結」 |
| 鍵盤操作（A09） | front | roving tabindex，←／→／Home／End／Enter／空白鍵，`aria-live` 朗讀 |
| 在這裡繼續（P15） | front | `reclaim()`，已列在 front 的 F1 |
| 字型 | front | 自架 Space Grotesk 拉丁子集，`unicode-range` 限定拉丁字元 |
| 協定欄位 | back（已完成） | 見第 7 節 |
| AI 改名 | back | `manager.py` 裡 AI 的暱稱從 `Perfect AI` 改成 `Super AI` |
| 再來一局不換色、先手輪流 | back | 真人對戰再來一局時維持原座位與顏色，先手改由上一局的後手擔任；snapshot 加上本局先手（提案 `game.first`）；`history` 的顏色規則、`docs/protocol.md` 和測試一起改 |
| 求解器 | 不變 | 不弱化、不加超時、不加備援 |

## 9. 品牌資產連動（C 保留綠／粉紅色相，只把色值調亮）

- **要依新色值重新輸出**：
  - `frontend/public/` 底下的 `connect4-mark.svg`、`connect4-mark-32.png`、`favicon.ico`、`apple-touch-icon.png`、
    `connect4-app-icon.svg`、`connect4-icon-192.png`、`connect4-icon-512.png`、`connect4-preview.svg`、`connect4-preview.png`。
  - 新的 mark 是薄荷棋疊粉紅棋，加 2px 墨框。
- **manifest 與 HTML**：
  - `site.webmanifest` 的 `background_color` 和 `theme_color` 改成 `#fff4dc`。
  - `index.html` 的 `theme-color` 也改成 `#fff4dc`。
  - OG／Twitter 的圖片替代文字寫的是「綠色與粉紅色棋子組成的 Connect 4 標誌」；色相沒變，照舊可用。
- **e2e 像素測試**（spec:804-805）：新色 `#3ddc97` 和 `#ff5fa2` 都符合判準，照樣會通過。

## 10. 偏離清單（和現有 e2e 斷言或既有設計不同的地方；使用者 2026-09-24 全部核准）

| # | 項目 | 現況 | 新設計 | 影響 |
|---|---|---|---|---|
| D1 | 回合狀態卡 | `.turn-card` 是棋盤上方一張獨立的卡；橫向手機會隱藏 | 改成棋盤上緣的狀態籤加落子軌道；橫向手機時移到右欄 | 截圖基準要重產 |
| D2 | 大廳版面 | 桌機三欄等寬卡 | 桌機兩欄：左邊是 AI 大卡（含迷你棋盤），右邊疊朋友卡與配對卡。簡報裡的「L01 三欄桌機」因此改名 | 截圖基準 |
| D3 | 對局中的房號 | 私人房對局時側欄有 `compact-code` 區塊，可點擊複製，房號字級 24、高度 ≥88，有 e2e 斷言（spec:883-884） | 對局中不再放可複製的房號區塊，房號只顯示在對局卡的模式籤；分享放在等朋友畫面（P02） | 要改 spec:883-884 |
| D4 | 桌機玩家列 | `player-strip` 一列放兩人，高度 ≥104 | 對局卡直排兩位玩家，每列高 ≥76。token 44、名字 18、「對」字 14 都保留 | 選擇器與高度斷言要改 |
| D5 | 顏色與棋盤 | sage 棋盤、`#66d3a3`／`#f38fae`、背景 `#f7f3ee` | 向日葵棋盤、`#3ddc97`／`#ff5fa2`、背景 `#fff4dc`、墨框硬陰影 | 36 張基準截圖全部重產 |
| D6 | 品牌字型 | 系統字 800 | Space Grotesk 700（拉丁子集 22KB），字級仍是 22／20 | 字級斷言不變 |
| D7 | 空格形狀 | 桌機實測 89.7×87.2，是橢圓 | 正圓，桌機 84、手機 48（第一階段三方向共用的 49.7 是舊值，以 48 為準，因為 C 的粗框需要空間） | — |
| D8 | 桌機棋盤寬 | 720 | 694，多出的空間給軌道 | — |
| D9 | 手機大廳 | AI 卡只有標題、說明、按鈕 | AI 卡加入迷你棋盤；展開朋友或配對卡時收起棋盤 | 卡片高度斷言要看；間距 16 保留 |
| D10 | 觸控落子 | 點一下就落子 | 仍是點一下就落子；另外按住時顯示預覽，可以拖動換欄，在棋盤外放開就取消 | 新增行為 |

**保留不變的斷言**：
- 品牌字 22／20。
- 觸控目標 ≥44。
- profile 欄位高 48、字級 16。
- select 的 `appearance: none`。
- 水平溢位 ≤1。
- `.hero-copy` 和 `.badge` 數量為 0（沒有加回 hero）。
- 10 個 device project，截圖差異上限 0.5%。

## 11. 未決事項

1. Safari 工具列展開時的可見高度 739 是假設值。手機矮視窗規則用 ≤780 作門檻，要在實機確認。
2. PingFang TC 和 Space Grotesk 混排時，數字與中文的基線可能略有落差，QA 時要看手數籤、比分、倒數。
3. QR 套件的選擇與實際體積由 front 實作時量測。
4. 已決定：`/?room=` 深連結開啟專屬邀請頁，按一下「加入房間」才加入。
5. 這套規格只涵蓋亮色，不做暗色（使用者 2026-09-24 決定）。

## 12. 新增與改寫的文案（zh-TW／en；完整字串見 `design/mockups/round2/strings.js`）

**英文標點**（使用者 2026-09-24）：英文文案一律用直的 `'` 和 `"`，不用彎引號 `’ “ ”`。英文也走 `--font-ui`，中文字型排在前面，會把彎引號畫成全形寬，看起來像多了一格空白（28px 字級下 `’` 寬 28px，`'` 只有約 8px）。

| key | zh-TW | en | 備註 |
|---|---|---|---|
| `challengeAgain` | 再次挑戰 | Challenge again | 新增（AI result panel; P12 keeps restart) |
| `backToLobby` | 回到大廳 | Back to lobby | 新增 |
| `shareInvite` | 分享邀請 | Share invite | 新增 |
| `copyLink` | 複製邀請連結 | Copy invite link | 新增 |
| `copiedLink` | 已複製邀請連結 | Invite link copied | 新增 |
| `aiBody` | 挑戰者，你能想出擊敗 AI 的戰術嗎？ | Challenger, can you find a strategy that beats the AI? | 改寫 |
| `lobbyOffline` | 連線恢復前無法開始對局。 | You can start a game once the connection is back. | 新增 |
| `inviteEyebrow` | 邀請 | Invite | 新增 |
| `inviteTitle` | 朋友邀請你一起玩 | A friend invited you to play | 新增 |
| `inviteBody` | 按下「加入房間」，朋友那邊就會開始對戰。 | Tap "Join room" and the game starts for both of you. | 新增 |
| `inviteRoom` | 房間 | Room | 新增 |
| `inviteAs` | 你的暱稱：{name} | Playing as {name} | 新增 |
| `editName` | 修改 | Edit | 新增 |
| `notNow` | 不加入，先去大廳 | Not now, go to lobby | 新增 |
| `inviteGone` | 這個房間無法加入 | This room can't be joined | 新增 |
| `inviteGoneBody` | 房號 {code} 不存在，可能房主已經離開。請朋友重新分享邀請。 | Room {code} doesn't exist; the host may have left. Ask your friend to share a new invite. | 新增（room_not_found) |
| `inviteFullBody` | 房間 {code} 已經滿了，請朋友重新開一個房間。 | Room {code} is already full. Ask your friend to open a new room. | 新增（room_full) |
| `inviteHostOffBody` | 房主目前離線，請稍後再試一次。 | The host is offline right now. Please try again in a moment. | 新增（host_disconnected) |
| `yourTurnHint` | 選一欄落子 | Pick a column | 新增 |
| `opponentTurn` | {name} 正在思考 | {name} is thinking | 新增（was game.opponentTurn) |
| `moveNo` | 第 {n} 手 | Move {n} | 新增 |
| `gameOver` | 對局結束 | Game over | 新增 |
| `first` | 先手 | First | 新增 |
| `second` | 後手 | Second | 新增 |
| `lastMove` | 上一手 | Last move | 新增；game.history |
| `solver` | Super AI | Super AI | 新增；AI seat label, e.g. 後手 · Super AI |
| `online` | 在線 | Online | 新增 |
| `offlineTag` | 離線 | Offline | 新增 |
| `kbdPick` | 選欄 | choose | 新增 |
| `kbdDrop` | 落子 | drop | 新增 |
| `series` | 本場比分 | Series | 新增；game.series |
| `modeAi` | 挑戰 Super AI | vs Super AI | 新增 |
| `modePrivate` | 私人房 | Private room | 新增 |
| `aiThinking` | AI 正在思考 | AI is thinking | 改寫 |
| `paused` | {name} 離線了 | {name} went offline | 新增（replaces game.paused) |
| `pausedBody` | 保留棋局 30 秒，等對方回來。 | Holding the game for 30 seconds while they reconnect. | 新增 |
| `reconnected` | {name} 回來了 | {name} is back | 新增 |
| `winSub` | 連成四子，共 {n} 手 | Four in a row in {n} moves | 新增 |
| `loseAi` | Super AI 拿下這局 | Super AI takes this one | 新增 |
| `loseAiSub` | 挑戰者別氣餒，再挑戰一次？ | Don't give up, challenger. Try again? | 新增 |
| `lose` | {name} 拿下這局 | {name} won this game | 新增 |
| `drawSub` | 42 格全滿，沒有人連成四子。 | All 42 slots are full and nobody connected four. | 新增 |
| `forfeitWin` | 你獲勝！{name} 離線逾時 | You win! {name} timed out | 新增（was game.forfeitWin) |
| `forfeitWinSub` | 對手沒有在 30 秒內回來。 | Your opponent didn't come back within 30 seconds. | 新增 |
| `forfeitLose` | 離線逾時，這局判負 | You timed out — game lost | 新增 |
| `forfeitLoseSub` | 你的連線中斷超過 30 秒，由對手獲勝。 | Your connection dropped for more than 30 seconds, so your opponent wins. | 新增 |
| `left` | {name} 離開了房間 | {name} left the room | 新增 |
| `leftSub` | 這局算你獲勝。對手已離開，無法再來一局。 | You win this game. They've left, so a rematch isn't available. | 新增 |
| `rematchSent` | 已邀請 {name} 再來一局 | Rematch invite sent to {name} | 新增（was game.rematchWaiting) |
| `rematchPending` | {name} 還沒回應 | Waiting for {name} to answer | 新增；game.rematch[opponent] false |
| `rematchWaitingBtn` | 等待對手回應… | Waiting for response… | 新增 |
| `rematchIncoming` | {name} 想再來一局！ | {name} wants a rematch! | 新增；game.rematch[opponent] |
| `rematchIncomingSub` | 按下就開始下一局：顏色不變，這局換 {name} 先下。 | Accept to start the next game. Colours stay; {name} moves first this time. | 新增；next first mover |
| `rematchAccept` | 好，再來一局 | Accept rematch | 新增 |
| `leftAfter` | {name} 已離開房間，無法再來一局。 | {name} has left the room, so a rematch isn't available. | 新增；rematch_available false |
| `gameOffline` | 連線中斷，正在重新連線… | Connection lost — reconnecting… | 新增 |
| `gameOfflineBody` | 恢復前棋盤暫停操作，棋局會保留。 | The board is paused until you're back. The game is kept. | 新增 |
| `otherTab` | 已在其他分頁開啟 | Open in another tab | 新增 |
| `otherTabBody` | 這局正在另一個分頁進行。一次只能有一個分頁連線；在這裡繼續，另一個分頁就會中斷。 | This game is running in another tab. Only one tab can be connected at a time; continuing here disconnects the other tab. | 新增 |
| `continueHere` | 在這裡繼續 | Continue here | 新增 |
| `waitedFor` | 已等待 {t} | Waiting {t} | 新增 |
| `waitingFriendBody` | 分享邀請或房號，朋友加入後立即開局。 | Share the invite or the code. The game starts as soon as they join. | 改寫 |
| `scanToJoin` | 用手機掃描加入 | Scan to join on a phone | 新增 |
| `errRoomCodeEmpty` | 請先輸入房號 | Enter a room code first | 新增（join with an empty code) |
| `errNickname` | 暱稱需為 1–18 個字。 | Nickname must be 1–18 characters. | 新增（invalid_nickname) |
| `errNicknameEmpty` | 請先輸入暱稱 | Enter a nickname first | 新增（empty nickname, checked while typing) |

**front 實作時補上的文案**（2026-09-24 回報，規格同意採用）：
- `movesTotal`：共 {n} 手／{n} moves。
- `common.close`：toast 關閉鈕的無障礙名稱。
- A09 的朗讀句：
  - `columnReady`：第 N 欄，可以落子。
  - `columnFull`：第 N 欄已滿。
  - `youDropped`：你在第 N 欄落子。
  - `opponentDropped`：對手在第 N 欄落子。

## 13. Artboard 索引（75 張畫面＋10 張分鏡＋1 張 GIF）

| ID | 檔名（design/artboards/round2/，副檔名 .png） |
|---|---|
| L01 | `L01-lobby-zh-desktop-1440x900`<br>`L01-lobby-zh-desktop-1366x768` |
| L02 | `L02-lobby-en-desktop-en-1440x900`<br>`L02-lobby-en-mobile-en-430x932` |
| L03 | `L03-lobby-tablet-tablet-768x1024` |
| L04 | `L04-lobby-collapsed-mobile-430x932`<br>`L04-lobby-collapsed-safari-430x739`<br>`L04-lobby-collapsed-landscape-892x412` |
| L05 | `L05-lobby-friends-expanded-mobile-430x932` |
| L06 | `L06-lobby-matchmaking-expanded-mobile-430x932` |
| L07 | `L07-lobby-offline-desktop-1440x900`<br>`L07-lobby-offline-mobile-430x932`<br>`L07-lobby-offline-mobile-en-430x932` |
| L08 | `L08-lobby-error-toast-desktop-1440x900`<br>`L08-lobby-error-toast-mobile-430x932` |
| L09 | `L09-profile-modal-desktop-1440x900` |
| L10 | `L10-profile-nickname-empty-desktop-1440x900`<br>`L10-profile-nickname-empty-mobile-430x932`<br>`L10-profile-nickname-empty-keyboard-430x932`<br>`L10-profile-nickname-empty-mobile-en-430x932` |
| L12 | `L12-invite-page-desktop-1440x900`<br>`L12-invite-page-mobile-430x932`<br>`L12-invite-page-mobile-en-430x932` |
| L13 | `L13-invite-room-gone-desktop-1440x900`<br>`L13-invite-room-gone-mobile-430x932` |
| L14 | `L14-lobby-join-empty-code-desktop-1440x900`<br>`L14-lobby-join-empty-code-mobile-430x932` |
| P01 | `P01-play-searching-desktop-1440x900`<br>`P01-play-searching-mobile-430x932` |
| P02 | `P02-play-waiting-friend-desktop-1440x900`<br>`P02-play-waiting-friend-mobile-430x932` |
| P03 | `P03-play-your-turn-desktop-1440x900`<br>`P03-play-your-turn-desktop-1366x768`<br>`P03-play-your-turn-mobile-430x932`<br>`P03-play-your-turn-safari-430x739`<br>`P03-play-your-turn-landscape-892x412` |
| P04 | `P04-play-opponent-turn-desktop-1440x900`<br>`P04-play-opponent-turn-mobile-430x932`<br>`P04-play-opponent-turn-landscape-892x412` |
| P05 | `P05-play-ai-thinking-desktop-1440x900`<br>`P05-play-ai-thinking-mobile-430x932` |
| P06 | `P06-play-opponent-paused-desktop-1440x900`<br>`P06-play-opponent-paused-mobile-430x932`<br>`P06-play-opponent-paused-mobile-en-430x932` |
| P07 | `P07-play-win-desktop-1440x900`<br>`P07-play-win-desktop-1366x768`<br>`P07-play-win-mobile-430x932`<br>`P07-play-win-safari-430x739`<br>`P07-play-win-landscape-892x412` |
| P08 | `P08-play-lose-ai-desktop-1440x900`<br>`P08-play-lose-ai-mobile-430x932` |
| P09 | `P09-play-draw-desktop-1440x900`<br>`P09-play-draw-mobile-430x932` |
| P10 | `P10-play-forfeit-win-desktop-1440x900`<br>`P10-play-forfeit-win-mobile-430x932`<br>`P10-play-forfeit-win-mobile-en-430x932` |
| P11 | `P11-play-opponent-left-desktop-1440x900`<br>`P11-play-opponent-left-mobile-430x932`<br>`P11-play-opponent-left-mobile-en-430x932` |
| P12 | `P12-play-solver-error-desktop-1440x900`<br>`P12-play-solver-error-mobile-430x932`<br>`P12-play-solver-error-mobile-en-430x932` |
| P13 | `P13-play-rematch-sent-desktop-1440x900`<br>`P13-play-rematch-sent-mobile-430x932` |
| P14 | `P14-play-offline-desktop-1440x900`<br>`P14-play-offline-mobile-430x932` |
| P15 | `P15-play-other-tab-desktop-1440x900`<br>`P15-play-other-tab-mobile-430x932`<br>`P15-play-other-tab-mobile-en-430x932` |
| P16 | `P16-play-forfeit-lose-desktop-1440x900`<br>`P16-play-forfeit-lose-mobile-430x932` |
| P17 | `P17-play-rematch-incoming-desktop-1440x900`<br>`P17-play-rematch-incoming-mobile-430x932` |
| P18 | `P18-play-opponent-left-after-finish-desktop-1440x900`<br>`P18-play-opponent-left-after-finish-mobile-430x932` |
| A01 | `A01-drop-gravity-bounce-storyboard` |
| A02 | `A02-column-preview-storyboard` |
| A03 | `A03-win-celebration-storyboard`<br>`A03-win-celebration-animated.gif`（動畫，eog 可播放） |
| A04 | `A04-ai-thinking-sweep-storyboard` |
| A05 | `A05-paused-countdown-storyboard` |
| A06 | `A06-waiting-feedback-storyboard` |
| A07 | `A07-lobby-to-play-transition-storyboard` |
| A08 | `A08-reduced-motion-alternatives-storyboard` |
| A09 | `A09-keyboard-play-storyboard` |
| A10 | `A10-lobby-mini-board-demo-storyboard` |
