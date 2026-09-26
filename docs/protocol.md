# Connect 4 WebSocket 協定

後端的協定契約。程式真相在 `backend/connect4_app/manager.py`（`handle`、`snapshot`）與
`backend/connect4_app/app.py`（`/ws`）；兩者不一致時以程式為準，並回報 connect4-back。
欄位只做加法；既有欄位要改語意時，前後端同步修改。

## 連線

1. `GET /api/session` 取得 `c4_session` cookie（HttpOnly）。
2. 開啟 `/ws`。伺服器接受連線後，立刻送出一則 `state.snapshot`。

手機 app 不用 cookie，改用 token，見下方「App 連線」。app 的 AI 局不經過伺服器，見「App 本機 AI 局」。

### Close code（不得改號）

| code | 意義 | 建議的前端處理 |
|---|---|---|
| 4001 | 同一 session 開了較新的連線，這條被取代 | 停止重連，顯示「已在其他分頁開啟」 |
| 4401 | 只會送給 app：token 無效或 session 已不存在（例如伺服器重啟） | 帶舊 token 重新 `GET /api/session`，改用回應裡的新 token 再連線 |
| 4403 | Origin 不在允許清單內（程式裡的代碼） | 不重連 |

**瀏覽器實際看到的代碼。** 網站沒有 session，或 Origin 不在清單內時，伺服器在握手階段就拒絕
（HTTP 403），不會完成連線，所以瀏覽器收到的是 `1006`，不是 4401 或 4403。網站前端的處理是：
除了 4001 之外，一律先重新 `GET /api/session` 再退避重連。只有 app 模式會先完成握手再以 4401
關閉，讓 app 能分辨「token 失效」和「網路斷線」。

## App 連線

iOS／Android app 把網頁打包在 app 裡（Capacitor），頁面來源是 `capacitor://localhost`（iOS）
或 `https://localhost`（Android），要跨網域連正式站。app 不用 cookie，改用 session token。

- **哪些請求算 app**：請求的 `Origin` 在 `CONNECT4_APP_ORIGINS` 清單內（預設就是上面兩個）。
  其他來源一律走網站的 cookie 流程，拿不到 token。
- **取得 token**：`GET /api/session` 或 `PATCH /api/session`，app 模式的回應會多一個欄位：

  ```ts
  { nickname: string; locale: "zh-TW" | "en"; token: string }
  ```

  app 每次都用回應裡的 `token` 覆蓋本機儲存的值；不會發 cookie。
- **HTTP 認證**：`Authorization: Bearer <token>`。沒帶 token 或 token 無效時，伺服器會建立新的
  session 並回傳新 token（和網站 cookie 失效時一樣）。
- **WebSocket 認證**：瀏覽器的 WebSocket 不能自訂 header，所以 token 放在子協定裡：

  ```js
  new WebSocket("wss://connect4.oraclelee.com/ws", ["connect4.v1", `connect4.token.${token}`]);
  ```

  伺服器一定會選用 `connect4.v1` 回應。用戶端提供了子協定、伺服器卻沒有選的話，Chrome 會直接讓
  連線失敗。token 有效就照常送出 `state.snapshot`；token 無效或沒帶時，完成握手後立即以 4401 關閉。
  app 來源沒有提供 `connect4.v1` 時，連線會在握手階段被拒絕。
- **CORS**：只有 app 來源可以跨網域讀取回應。允許的方法是 `GET`、`PATCH`，允許的 header 是
  `Authorization`、`Content-Type`；不帶 credentials；預檢結果快取 600 秒。
- **token 絕不放在網址裡**（nginx 的存取日誌會記下網址）。網址裡的 `?token=` 會被忽略。
- **版本**：`connect4.v1` 是 app 協定的版本。之後若有不相容的改動會新增 `connect4.v2`，並繼續接受
  `connect4.v1`，已安裝的舊版 app 不會因此失效。

## 用戶端 → 伺服器

格式：`{"type": string, "payload": object}`。角色、回合與結果一律由伺服器判定。

| type | payload | 說明 |
|---|---|---|
| `game.ai.start` | `{}` | 開一局對 Super AI 的棋，玩家執綠、先手 |
| `game.ai.retry` | `{}` | AI 局結束或求解器故障後，重開一局（不換色） |
| `room.create` | `{}` | 建立私人房，建立者執綠 |
| `room.join` | `{"code": string}` | 以 6 碼房號加入私人房 |
| `queue.join` / `queue.leave` | `{}` | 加入或離開隨機配對 |
| `game.move` | `{"column": 0–6}` | 落子 |
| `game.rematch` | `{}` | 投票再來一局；真人局雙方都投票後以原座位與顏色重開，先手換成上一局的後手；AI 局立即重開 |
| `game.leave` | `{}` | 離開房間；對局尚未結束時視為判負，`result_reason` 為 `left` |
| `state.request` | `{}` | 要求重送 snapshot |

## 伺服器 → 用戶端

### `error`

`{"type": "error", "payload": {"code": string}}`。代碼如下：
`invalid_message`、`unknown_message`、`invalid_payload`、`already_in_game`、`already_searching`、
`room_not_found`、`room_full`、`host_disconnected`、`not_in_game`、`not_a_player`、
`game_not_playable`、`not_your_turn`、`invalid_column`、`column_full`、`rematch_unavailable`。

### `state.snapshot`

每次狀態改變都會把完整 snapshot 推送給房內每位真人玩家。前端應整份取代，不要做合併。

```ts
{
  server_time: number;            // 產生當下的伺服器 Unix 秒（有小數）；game 為 null 時也會送
  session: { nickname: string; locale: "zh-TW" | "en" };
  queue: { searching: boolean };
  room: { id: string; code: string | null; mode: "ai" | "private" | "matchmaking" } | null;
  game: {
    revision: number;             // 對局狀態每變一次就 +1
    status: "waiting" | "playing" | "thinking" | "paused" | "finished" | "error";
    board: ("green" | "pink" | null)[][];   // 6 列 × 7 欄，board[0] 是最上面一列
    history: string;              // 落子序列，"1"–"7" 代表第 1 到第 7 欄；第 i 手（從 0 起算）i 為偶數是 first
    first: "green" | "pink";      // 這一局的先手顏色，見下方「先後手」
    turn: "green" | "pink";
    you: "green" | "pink";
    winner: "green" | "pink" | null;
    winning_cells: { row: number; column: number }[];
    result_reason: "connect_four" | "draw" | "forfeit" | "left" | "solver_unavailable" | null;
    players: Partial<Record<"green" | "pink", {
      nickname: string;
      connected: boolean;
      is_ai: boolean;
      grace_deadline: number | null;   // 見下方「斷線倒數」
    }>>;
    rematch: { green: boolean; pink: boolean };   // 各顏色是否已投票再來一局
    rematch_requested: boolean;   // 等於 rematch[you]，為相容而保留
    rematch_available: boolean;   // 見下方「再來一局」
    series: { you: number; opponent: number; draws: number };
    grace_deadline: number | null;   // 見下方「斷線倒數」
  } | null;
}
```

#### 先後手、上一手與手數

- `first` 是這一局的先手顏色，不要假設綠方先手。
  - 新房間的第一局由 `green` 先手。
  - 真人局再來一局時，座位與顏色不變，先手換成上一局的後手；所以真人局下一局的先手，就是 `first` 的另一色。
  - AI 局恆為 `green`，玩家執綠、先手，重新開始也不變。
- `history` 的長度就是手數。第 i 手（從 0 起算）i 為偶數是 `first`，奇數是另一色。
- 最後一個字元就是上一手的欄位，該欄最上面一顆棋子就是上一手。

#### 斷線倒數

- `players[c].grace_deadline`：只有在 `status === "paused"` 且該玩家離線時才有值，代表該玩家
  被判負的伺服器時間（Unix 秒）。其餘情況一律為 `null`；每位玩家各自計時，互不覆蓋。
- `game.grace_deadline`：只有在 `status === "paused"` 時才有值，等於離線玩家中最早的判負時間。
- AI 局沒有斷線倒數：玩家離線時棋局會保留，直到玩家回來或主動離開。
- 倒數請用伺服器時間計算：`offset = server_time - 收到 snapshot 時的本機秒數`，
  `剩餘秒數 = grace_deadline - (本機現在秒數 + offset)`。

#### 配對中斷線

手機把 app 切到背景時，WebSocket 會斷線。配對中的人斷線後，伺服器會把他的位置保留 30 秒
（和對局的斷線寬限期相同）：

- 離開期間，他仍在佇列裡，但**不會被配對**；別人加入配對時只會配給在線的人，佇列裡只剩離線的人時，
  新加入的人就照常等待。
- 30 秒內重連，snapshot 的 `queue.searching` 維持 `true`；伺服器會在重連當下立刻嘗試配對，如果有
  人正在等，回傳的 snapshot 就直接帶著新的一局。
- 超過 30 秒沒回來，伺服器會把他移出佇列；之後重連時 `queue.searching` 為 `false`。
- 換分頁（4001）不算斷線，位置不受影響。

#### 再來一局

- `rematch_available`：現在投票能不能成局。
  - AI 局：`status` 為 `finished` 或 `error` 時為 true。
  - 真人局：`status` 為 `finished`，且兩位玩家都還在房內時為 true。對手只是斷線時仍為 true，
    可用 `players[c].connected` 顯示離線；對手已經 `game.leave` 時為 false。這個判斷
    **不能**從 `result_reason` 推導，因為正常分出勝負後才離開時，`result_reason` 會維持原值。
  - `waiting`、`playing`、`thinking`、`paused` 一律為 false。
  - 為 false 時送出 `game.rematch`，會收到 `rematch_unavailable`。AI 局送 `game.rematch` 或
    `game.ai.retry` 效果相同。
- `rematch[c]`：玩家斷線、離開、落子或新局開始時，票會被撤回或清空；只有換分頁（4001）不會。

#### 比分

`series` 是本房間的累計比分，以玩家（session）計算。判負與離開都計入勝方；
和局計入 `draws`。房間刪除後比分就消失。

## 伺服器保證

- 單一 uvicorn worker；房間、配對與 session 都存在記憶體裡，程序重啟就會全部清空。
- 求解器沒有啟發式或計時備援。故障時 `status` 為 `error`，`result_reason` 為 `solver_unavailable`。
- AI 局在玩家落子後進入 `thinking`，至少維持 1 秒才落子；求解超過 1 秒時不再額外等待。
  這只影響時間，不影響下法；求解器故障會立即回報 `error`，不等待。
- AI 在已下 9、11、13 手時，改查預先算好的精確分數表（`native_solver/data/reply-table.bin`），其他時候現場求解；兩者給出的分數與選的欄完全相同，下法不變。表無法載入或查不到時一律現場求解。
- 伺服器只負責網站的 AI 局與所有真人局。app 的 AI 局在手機上進行，伺服器不會收到，也不接受
  用戶端回報的 AI 對局結果；見下方「App 本機 AI 局」。

## App 本機 AI 局

iOS／Android app 的 AI 對局一律在手機上計算，有沒有網路都一樣，所以離線也能玩。網站的 AI 局不變，
仍由伺服器計算。

- **同一份協定**：`frontend/src/local/localGame.ts` 照 `manager.py` 處理 AI 局的訊息
  （`game.ai.start`、`game.move`、`game.ai.retry`、`game.rematch`、`game.leave`、`state.request`），
  送出同樣形狀的 `state.snapshot` 與同樣的錯誤代碼；其他訊息回 `unknown_message`。畫面不必分辨
  AI 在伺服器還是在手機上。和伺服器不同的只有：房間 id 以 `local-` 開頭，`server_time` 取手機時鐘，
  兩位玩家的 `connected` 恆為 true。規則在 `frontend/src/local/rules.ts`，照 `domain.py` 移植。
- **同樣的下法**：Web Worker 裡的 `connect-four-ai-wasm`（與伺服器的 `connect-four-ai` 同為 1.0.0），
  加上同一份分數表與同樣的中央優先順序 `[3,2,4,1,5,0,6]`，每一手都是精確解，和伺服器選的欄完全相同。
  AI 同樣至少想 1 秒才落子。
- **故障**：WASM 載入或求解失敗時，`status` 為 `error`，`result_reason` 為 `solver_unavailable`，不會改用
  其他下法；玩家用 `game.ai.retry` 重開。分數表載入或解析失敗時，Worker 在 console 留一行
  `[local-ai] reply table unavailable` 警告，之後每一手都改成現場計算：下法不變，只是比較慢。
- **存檔**：進行中的對局（`history`、`series`、`revision`、是否故障）只存在手機上。app 重開後照
  `history` 重建棋盤；如果輪到 AI，AI 會重新計算，下出同一手。離開對局就刪除存檔。
- **和伺服器上的狀態**：
  - 連得上伺服器時，本機的 `game.ai.start` 照伺服器的規則擋：玩家在房間或對局中回
    `already_in_game`，搜尋配對中回 `already_searching`。
  - 離線時開始本機 AI 局，視為放棄搜尋：app 記下一個 `queue.leave`，重連後再送。
  - 搜尋中的人在 30 秒內重連時，伺服器會在連線當下就配對（見「配對中斷線」）。所以重連後的第一個
    snapshot 可能已經是真人局；這時 app 送 `game.leave`，對手會以 `left` 獲勝。
- **一致性測試**：`tests/local_parity.py` 從 `domain.py`、`manager.py` 與原生求解器錄下
  `frontend/tests/local/fixtures/`，`frontend/tests/local/` 用同一份資料驗證手機版。改了伺服器 AI 局的
  規則、訊息或錯誤代碼時，要執行 `.venv/bin/python tests/local_parity.py` 重新產生，並同步修改
  `frontend/src/local/`；兩邊不一致時 `tests/test_local_parity.py` 會失敗。
