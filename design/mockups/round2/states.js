// One fixture per page ID. Game fixtures follow frontend/src/types.ts
// (Snapshot.game) plus the fields connect4-back finalised in docs/protocol.md:
//   game.history          -> `last` below (last move) and the move count
//   game.rematch {g, p}   -> `rematch`
//   game.rematch_available
//   game.series {you, opponent, draws}
//   players[c].grace_deadline - snapshot.server_time -> `graceLeft` seconds
//   game.first (proposed): colour that moved first this game; defaults to green
// Front can reuse these as e2e mocks; spec.md maps each one to its artboards.

(() => {
const rows = (...lines) =>
  lines.map((line) =>
    [...line].map((ch) => (ch === "G" ? "green" : ch === "P" ? "pink" : null)),
  );

const EMPTY = rows(".......", ".......", ".......", ".......", ".......", ".......");
// frontend/e2e gameSnapshot board: 6 moves played, green to move (move 7)
const B7 = rows(".......", ".......", ".......", ".......", "..GPG..", "..PGP..");
// after my move in column 5: AI to move (move 8)
const B8 = rows(".......", ".......", ".......", "....G..", "..GPG..", "..PGP..");
// quick match, I am pink; 8 moves played, green (opponent) to move
const B8m = rows(".......", ".......", ".......", "...P...", "..GGP..", ".PGPG..");
// mid game used by paused / forfeit / left states: 12 moves, green (me) to move
const B11 = rows(".......", ".......", "...G...", "...PG..", "..GGPP.", ".PGPGP.");
// green wins on the diagonal (5,1)-(4,2)-(3,3)-(2,4) with move 13
const B13win = rows(".......", ".......", "....G..", "...GP..", "..GPGG.", "PGPGPP.");
// pink (Super AI) wins in column 5 with move 12
const B12lose = rows(".......", ".......", "....P..", "...GP..", "..GGP..", ".GPGPGP");
// full board, no four in a row (verified by design/tools/check-boards.py)
const BDRAW = rows(
  "GGPPGGP",
  "PPGGPPG",
  "GGPPGGP",
  "PPGGPPG",
  "GGPPGGP",
  "PPGGPPG",
);

const me = { nickname: "曜宇", connected: true, is_ai: false };
const ai = { nickname: "Super AI", connected: true, is_ai: true };
const friend = { nickname: "小安", connected: true, is_ai: false };
const stranger = { nickname: "玩家 4821", connected: true, is_ai: false };

const aiGame = (extra) => ({
  view: "game",
  room: { mode: "ai", code: null },
  game: {
    status: "playing",
    board: B7,
    turn: "green",
    you: "green",
    winner: null,
    winning_cells: [],
    result_reason: null,
    players: { green: me, pink: ai },
    rematch_requested: false,
    ...extra,
  },
});

const privateGame = (extra) => ({
  view: "game",
  room: { mode: "private", code: "LAN427" },
  game: {
    status: "playing",
    board: B11,
    turn: "green",
    you: "green",
    winner: null,
    winning_cells: [],
    result_reason: null,
    players: { green: me, pink: friend },
    rematch: { green: false, pink: false },
    rematch_available: true,
    series: { you: 0, opponent: 0, draws: 0 },
    last: { row: 4, column: 5 },
    ...extra,
  },
});

const lobby = (extra) => ({ view: "lobby", lobby: { expanded: null, code: "", ...extra } });

window.STATES = {
  L01: lobby({}),
  L02: lobby({}),
  L03: lobby({}),
  L04: lobby({}),
  L05: lobby({ expanded: "friends" }),
  L06: lobby({ expanded: "matchmaking" }),
  L07: { ...lobby({}), connection: "offline" },
  L08: { ...lobby({ expanded: "friends", code: "ABC123" }), toast: "errRoomNotFound" },
  L09: { ...lobby({}), profile: { nickname: "曜宇", error: false } },
  L10: { ...lobby({}), profile: { nickname: "", error: true } },

  L12: { view: "invite", code: "LAN427" },
  L14: lobby({ expanded: "friends", code: "", joinError: true }),
  L13: { view: "invite", code: "LAN427", error: "gone" },

  P01: { view: "searching", waited: "0:12" },
  P02: { view: "waiting", room: { mode: "private", code: "LAN427" } },
  P03: aiGame({ hover: 4, last: { row: 4, column: 3 } }),
  P04: {
    view: "game",
    room: { mode: "matchmaking", code: null },
    game: {
      status: "playing",
      board: B8m,
      turn: "green",
      you: "pink",
      winner: null,
      winning_cells: [],
      result_reason: null,
      players: { green: stranger, pink: me },
      rematch_requested: false,
      series: { you: 0, opponent: 0, draws: 0 },
      last: { row: 3, column: 3 },
    },
  },
  P05: aiGame({ status: "thinking", board: B8, turn: "pink", last: { row: 3, column: 4 } }),
  P06: privateGame({
    status: "paused",
    players: { green: me, pink: { ...friend, connected: false } },
    graceLeft: 18,
  }),
  P07: privateGame({
    status: "finished",
    board: B13win,
    turn: "pink",
    winner: "green",
    result_reason: "connect_four",
    winning_cells: [
      { row: 5, column: 1 },
      { row: 4, column: 2 },
      { row: 3, column: 3 },
      { row: 2, column: 4 },
    ],
    last: { row: 2, column: 4 },
    series: { you: 1, opponent: 0, draws: 0 },
  }),
  P08: aiGame({
    status: "finished",
    board: B12lose,
    turn: "green",
    winner: "pink",
    result_reason: "connect_four",
    winning_cells: [
      { row: 5, column: 4 },
      { row: 4, column: 4 },
      { row: 3, column: 4 },
      { row: 2, column: 4 },
    ],
    last: { row: 2, column: 4 },
  }),
  P09: privateGame({
    status: "finished",
    board: BDRAW,
    winner: null,
    result_reason: "draw",
    last: { row: 0, column: 6 },
    series: { you: 1, opponent: 1, draws: 1 },
  }),
  P10: privateGame({
    status: "finished",
    winner: "green",
    result_reason: "forfeit",
    players: { green: me, pink: { ...friend, connected: false } },
  }),
  P11: privateGame({
    status: "finished",
    winner: "green",
    result_reason: "left",
    rematch_available: false,
    players: { green: me, pink: { ...friend, connected: false } },
  }),
  P12: aiGame({ status: "error", board: B8, turn: "pink", result_reason: "solver_unavailable", last: { row: 3, column: 4 } }),
  P13: privateGame({
    status: "finished",
    board: B13win,
    turn: "pink",
    winner: "green",
    result_reason: "connect_four",
    winning_cells: [
      { row: 5, column: 1 },
      { row: 4, column: 2 },
      { row: 3, column: 3 },
      { row: 2, column: 4 },
    ],
    last: { row: 2, column: 4 },
    series: { you: 1, opponent: 0, draws: 0 },
    rematch: { green: true, pink: false },
  }),
  P14: { ...aiGame({ board: B7, last: { row: 4, column: 3 } }), connection: "offline" },
  P15: { view: "otherTab" },
  P17: privateGame({
    status: "finished",
    board: B12lose,
    turn: "green",
    winner: "pink",
    result_reason: "connect_four",
    winning_cells: [
      { row: 5, column: 4 },
      { row: 4, column: 4 },
      { row: 3, column: 4 },
      { row: 2, column: 4 },
    ],
    last: { row: 2, column: 4 },
    series: { you: 1, opponent: 1, draws: 0 },
    rematch: { green: false, pink: true },
  }),
  P18: privateGame({
    status: "finished",
    board: B13win,
    turn: "pink",
    winner: "green",
    result_reason: "connect_four",
    winning_cells: [
      { row: 5, column: 1 },
      { row: 4, column: 2 },
      { row: 3, column: 3 },
      { row: 2, column: 4 },
    ],
    last: { row: 2, column: 4 },
    series: { you: 1, opponent: 0, draws: 0 },
    rematch_available: false,
    players: { green: me, pink: { ...friend, connected: false } },
  }),
  P16: privateGame({
    status: "finished",
    turn: "green",
    winner: "pink",
    result_reason: "forfeit",
    players: { green: { ...me }, pink: friend },
  }),
};

window.BOARDS = { EMPTY, B7, B8, B8m, B11, B13win, B12lose, BDRAW };
})();
