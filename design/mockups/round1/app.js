// Round-1 mockup renderer: one fixed P03 state (AI mode, move 7, my turn),
// rendered with the direction theme named by ?dir=a|b|c.
const params = new URLSearchParams(location.search);
const dir = params.get("dir") ?? "a";
document.documentElement.dataset.dir = dir;
document.head.insertAdjacentHTML(
  "beforeend",
  `<link rel="stylesheet" href="theme-${dir}.css" />`,
);

// Same board as frontend/e2e/mobile-layout.spec.ts gameSnapshot.
const G = "g";
const P = "p";
const board = [
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null],
  [null, null, G, P, G, null, null],
  [null, null, P, G, P, null, null],
];
const hoverColumn = 4; // pointer / keyboard focus is on column 5
const lastMove = { row: 4, column: 3 }; // Perfect AI's last move (needs backend history)
const landingRow = board.findLastIndex((row) => row[hoverColumn] === null);

const copy = {
  a: { me: "你 · 先手", opp: "後手 · 精確求解器", youTag: "輪到你" },
  b: { me: "P1 · 你 · 先手", opp: "P2 · 精確求解器", youTag: "輪到你" },
  c: { me: "你 · 先手", opp: "後手 · 精確求解器", youTag: "輪到你！" },
}[dir];

const token = (color, extra = "") =>
  `<i class="token ${color} ${extra}" aria-hidden="true"></i>`;

const cells = board
  .flatMap((row, r) =>
    row.map((cell, c) => {
      const classes = ["cell"];
      let inner = "";
      if (cell) inner = token(cell);
      if (r === landingRow && c === hoverColumn) {
        classes.push("is-preview");
        inner = token(G, "ghost");
      }
      if (cell && r === lastMove.row && c === lastMove.column) {
        classes.push("is-last");
      }
      return `<div class="${classes.join(" ")}">${inner}</div>`;
    }),
  )
  .join("");

document.body.innerHTML = `
<div class="app">
  <div class="device" aria-hidden="true">
    <span class="sb-time">9:41</span><span class="island"></span>
    <span class="sb-icons"><i></i><i></i><i></i></span>
    <span class="home-indicator"></span>
    <span class="safe-line top"></span><span class="safe-line bottom"></span>
  </div>
  <header class="topbar">
    <a class="brand" href="#">
      <span class="brand-mark">${token(G, "mini")}${token(P, "mini")}</span>
      <span class="brand-text">CONNECT 4</span>
    </a>
    <button class="profile" type="button">
      <span class="avatar">曜</span><span class="profile-name">曜宇</span>
    </button>
  </header>

  <main class="play" style="--hc: ${hoverColumn}">
    <section class="board-unit">
      <div class="board-head" role="status">
        <div class="turn-status">
          ${token(G, "status-token")}
          <strong>輪到你了</strong>
          <span class="hint">選一欄落子</span>
        </div>
        <span class="move-chip">第 <b>7</b> 手</span>
      </div>
      <div class="rail">
        <div class="hand">${token(G, "in-hand")}<span class="drop-cue"></span></div>
      </div>
      <div class="board">
        <span class="col-hover"></span>
        <div class="grid">${cells}</div>
      </div>
      <div class="board-foot"></div>
    </section>

    <aside class="side">
      <div class="card match-card">
        <p class="mode-label">挑戰 Perfect AI</p>
        <div class="player is-current">
          ${token(G, "player-token")}
          <span class="player-copy"><strong>曜宇</strong><small>${copy.me}</small></span>
          <span class="turn-tag">${copy.youTag}</span>
        </div>
        <div class="versus"><span>對</span></div>
        <div class="player">
          ${token(P, "player-token")}
          <span class="player-copy"><strong>Perfect AI</strong><small>${copy.opp}</small></span>
          <span class="presence"><i></i>在線</span>
        </div>
      </div>

      <div class="card stats">
        <div><small>先手</small><strong>你</strong></div>
        <div><small>上一手</small><strong>${token(P, "stat-token")}第 4 欄</strong></div>
      </div>

      <div class="actions">
        <button class="btn secondary" type="button">離開</button>
      </div>
      <p class="kbd-hint"><kbd>←</kbd><kbd>→</kbd> 選欄　<kbd>Enter</kbd> 落子</p>
    </aside>
  </main>
</div>`;
