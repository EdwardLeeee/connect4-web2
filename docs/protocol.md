# Connect 4 WebSocket 協定

後端的協定契約。程式真相在 `backend/connect4_app/manager.py`（`handle`、`snapshot`）與
`backend/connect4_app/app.py`（`/ws`）；兩者不一致時以程式為準，並回報 connect4-back。
欄位只做加法；既有欄位要改語意時，前後端同步修改。

## 連線

1. `GET /api/session` 取得 `c4_session` cookie（HttpOnly）。
2. 開啟 `/ws`。伺服器接受連線後，立刻送出一則 `state.snapshot`。

### Close code（不得改號）

| code | 意義 | 建議的前端處理 |
|---|---|---|
| 4001 | 同一 session 開了較新的連線，這條被取代 | 停止重連，顯示「已在其他分頁開啟」 |
| 4401 | 沒有 session cookie，或 session 已不存在（例如伺服器重啟） | 先重新 `GET /api/session`，再連線 |
| 4403 | Origin 不在允許清單內 | 不重連 |

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
