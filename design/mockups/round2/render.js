// Round-2 renderer: screen.html?state=P07&lang=zh-TW&vp=mobile
//   state : page ID from states.js
//   lang  : zh-TW | en
//   vp    : desktop | tablet | mobile (PWA, safe areas) | keyboard (PWA + iOS
//           keyboard) | safari (toolbar expanded) | landscape
const params = new URLSearchParams(location.search);
const stateId = params.get("state") ?? "P03";
const lang = params.get("lang") ?? "zh-TW";
const vp = params.get("vp") ?? "desktop";
// round 3 (user picked): result panel R1 gold trophy, invite = its own page,
// waiting room = one button (desktop copy link, phone share)
const S = window.STATES[stateId];
const T = window.STRINGS[lang];
document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
document.documentElement.dataset.vp = vp;
document.documentElement.dataset.state = stateId;
// round 11 proposal (item 08): narrow-phone board — a = cells shrink with the
// screen, b = tighter margins and gaps below 422px; unset = current behaviour
if (params.get("nb")) document.documentElement.dataset.nb = params.get("nb");
// fo=1 draws the main text field focused (round 5 check of focus frames)
const focusDemo = params.get("fo") === "1";

const t = (key, vars = {}) =>
  (T[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------- icons (24px grid, 2.5px ink strokes) ----------
const svg = (body, size = 24) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  ai: svg('<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/><path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" stroke-width="1.2"/>'),
  friends: svg('<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>'),
  match: svg('<path d="M3 7h4.5c2 0 3.2 1 4.5 3l1 2c1.3 2 2.5 3 4.5 3H21"/><path d="M18 12l3 3-3 3"/><path d="M3 17h4.5c1.5 0 2.5-.5 3.4-1.6"/><path d="M13.1 8.6C14 7.5 15 7 16.5 7H21"/><path d="M18 4l3 3-3 3"/>'),
  share: svg('<path d="M12 15V3M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/>'),
  link: svg('<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11"/>'),
  warn: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.6v.2"/>'),
  wifiOff: svg('<path d="M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0"/><path d="M12 19.5v.1"/><path d="M3 3l18 18"/>'),
  tabs: svg('<rect x="3" y="7" width="13" height="12" rx="2"/><path d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2h-3"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  arrow: svg('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  back: svg('<path d="M20 12H5M11 6l-6 6 6 6"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4"/><path d="M12 13v4M8.5 20h7M9.5 17h5"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  equal: svg('<path d="M6 9.5h12M6 14.5h12"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>'),
};

const token = (colour, extra = "") =>
  colour ? `<i class="token ${colour} ${extra}" aria-hidden="true"></i>` : "";

// ---------- shared chrome ----------
function deviceFrame() {
  if (vp !== "mobile" && vp !== "keyboard") return "";
  return `<div class="device" aria-hidden="true">
    <span class="sb-time">9:41</span><span class="island"></span>
    <span class="sb-icons"><i></i><i></i></span>
    <span class="home-indicator"></span>
  </div>`;
}

function topbar() {
  const conn = S.connection ?? "online";
  const pill =
    conn === "online"
      ? ""
      : `<span class="connection-pill ${conn}" role="status"><span class="status-dot"></span>${t(conn)}</span>`;
  return `<header class="topbar">
    <a class="brand" href="#" aria-label="Connect 4 home">
      <span class="brand-mark">${token("green", "mini")}${token("pink", "mini")}</span>
      <span class="brand-text">${t("brand")}</span>
    </a>
    <div class="topbar-actions">
      ${pill}
      <button class="profile" type="button"><span class="avatar">曜</span><span class="profile-name">曜宇</span></button>
    </div>
  </header>`;
}

function btn(label, kind = "secondary", { icon = "", disabled = false, cls = "" } = {}) {
  return `<button class="btn ${kind} ${cls}" type="button"${disabled ? " disabled" : ""}>${icon}<span>${label}</span></button>`;
}

// ---------- lobby ----------
const MINI = [
  ".......",
  ".......",
  "....g..",
  "...GP..",
  "..GPG..",
  ".GPGP..",
];

function miniBoard() {
  const cells = MINI.flatMap((row) =>
    [...row].map((ch) => {
      if (ch === "G") return `<span class="cell">${token("green")}</span>`;
      if (ch === "P") return `<span class="cell">${token("pink")}</span>`;
      if (ch === "g") return `<span class="cell">${token("green", "ghost")}</span>`;
      return `<span class="cell"></span>`;
    }),
  );
  return `<div class="mini-board" aria-hidden="true"><div class="grid">${cells.join("")}</div></div>`;
}

function lobby() {
  const L = S.lobby;
  const offline = (S.connection ?? "online") !== "online";
  const ex = (name) => (L.expanded === name ? " is-expanded" : "");
  const chevron = (id, labelId, name) =>
    `<button class="card-toggle" type="button" aria-labelledby="${labelId}" aria-controls="${id}" aria-expanded="${L.expanded === name}">${ICON.chevron}</button>`;
  const offlineBanner = offline
    ? `<div class="notice-banner" role="status">${ICON.wifiOff}<span>${t("lobbyOffline")}</span></div>`
    : "";
  return `<section class="lobby">
    ${offlineBanner}
    <div class="lobby-grid">
      <article class="mode-card ai-card">
        <div class="card-head">
          <span class="card-icon ai">${ICON.ai}</span>
          <div class="card-copy"><h2>${t("aiTitle")}</h2><p>${t("aiBody")}</p></div>
        </div>
        ${miniBoard()}
        ${btn(t("aiAction"), "primary big", { icon: "", disabled: offline, cls: "with-arrow" }).replace("</span></button>", `</span>${ICON.arrow}</button>`)}
      </article>
      <article class="mode-card friend-card collapsible${ex("friends")}">
        <div class="card-head">
          <span class="card-icon friends">${ICON.friends}</span>
          <div class="card-copy"><h2 id="friends-title">${t("friendTitle")}</h2><p>${t("friendBody")}</p></div>
          ${chevron("friends-panel", "friends-title", "friends")}
        </div>
        <div class="card-panel" id="friends-panel">
          ${btn(t("createRoom"), "secondary", { disabled: offline })}
          <form class="join-row">
            <input class="code-input${L.code ? " filled" : ""}${L.joinError ? " has-error is-focused" : ""}${focusDemo && !L.joinError ? " is-focused" : ""}" value="${esc(focusDemo && !L.code ? "LAN4" : L.code)}" placeholder="${t("roomCode")}" maxlength="6" aria-label="${t("roomCode")}"${L.joinError ? ' aria-invalid="true" aria-describedby="join-error"' : ""} />
            ${btn(t("joinRoom"), "dark", { disabled: offline })}
          </form>
          ${L.joinError ? `<p class="form-error join-error" id="join-error" role="alert">${ICON.warn}${t("errRoomCodeEmpty")}</p>` : ""}
        </div>
      </article>
      <article class="mode-card match-card-lobby collapsible${ex("matchmaking")}">
        <div class="card-head">
          <span class="card-icon match">${ICON.match}</span>
          <div class="card-copy"><h2 id="match-title">${t("matchTitle")}</h2><p>${t("matchBody")}</p></div>
          ${chevron("match-panel", "match-title", "matchmaking")}
        </div>
        <div class="card-panel" id="match-panel">
          ${btn(t("matchAction"), "secondary", { disabled: offline })}
        </div>
      </article>
    </div>
  </section>`;
}

// ---------- waiting screens ----------
function searching() {
  return `<section class="center-screen">
    <div class="center-card">
      <div class="searching-anim" aria-hidden="true">
        <span class="lane">${token("green")}${token("pink")}${token("green")}</span>
      </div>
      <p class="eyebrow">${t("waiting")}</p>
      <h1>${t("searching")}</h1>
      <p class="lead">${t("searchingBody")}</p>
      <p class="meta-row"><span class="meta-chip">${t("waitedFor", { t: S.waited })}</span></p>
      ${btn(t("cancelSearch"), "secondary")}
    </div>
  </section>`;
}

function waiting() {
  const code = S.room.code;
  const phone = vp !== "desktop" && vp !== "tablet";
  return `<section class="center-screen">
    <div class="center-card waiting-card">
      <div class="waiting-main">
        <p class="eyebrow">${t("waiting")}</p>
        <h1>${t("waitingFriend")}</h1>
        <p class="lead">${t("waitingFriendBody")}</p>
        <div class="room-code-block">
          <span>${t("roomCode")}</span>
          <strong>${esc(code)}</strong>
        </div>
        <div class="waiting-actions single">
          ${phone ? btn(t("shareInvite"), "primary", { icon: ICON.share }) : btn(t("copyLink"), "primary", { icon: ICON.link })}
          ${btn(t("leave"), "ghost")}
        </div>
      </div>
      <figure class="qr-card">
        <img src="assets/qr-LAN427.svg" alt="QR code: https://connect4.oraclelee.com/?room=${esc(code)}" />
        <figcaption>${t("scanToJoin")}</figcaption>
      </figure>
    </div>
  </section>`;
}

// round 7 proposal (L12 v2): the invite page asks for the nickname directly
const inviteV2 = params.get("iv2") === "1";
const inviteName = params.get("nm") ?? "玩家 4821";

function inviteNameField() {
  const empty = inviteName.trim() === "";
  return `<label class="invite-name">
      <span class="field-label">${t("inviteNameLabel")}</span>
      <input class="is-focused${empty ? " has-error" : ""}" value="${esc(inviteName)}" maxlength="18" autocomplete="nickname"${empty ? ' aria-invalid="true"' : ""} />
    </label>
    ${empty ? `<p class="form-error invite-name-msg" role="alert">${ICON.warn}${t("errNicknameEmpty")}</p>` : `<p class="invite-name-msg hint">${t("inviteNameHint")}</p>`}`;
}

function inviteCard() {
  const gone = S.error === "gone";
  return `<div class="center-card invite-card${gone ? " is-gone" : ""}">
      <span class="big-icon">${gone ? ICON.warn : ICON.friends}</span>
      <p class="eyebrow">${t("inviteEyebrow")}</p>
      <h1>${gone ? t("inviteGone") : t("inviteTitle")}</h1>
      <p class="lead">${gone ? t("inviteGoneBody", { code: esc(S.code) }) : inviteV2 ? t("inviteBodyName") : t("inviteBody")}</p>
      ${gone ? "" : `<div class="room-code-block"><span>${t("inviteRoom")}</span><strong>${esc(S.code)}</strong></div>
      ${inviteV2 ? inviteNameField() : `<p class="invite-as">${ICON.user}<span>${t("inviteAs", { name: "曜宇" })}</span><button class="link-btn" type="button">${t("editName")}</button></p>`}`}
      ${gone ? btn(t("backToLobby"), "primary big", { icon: ICON.back }) : btn(t("joinRoom"), "primary big", { icon: ICON.arrow, disabled: inviteV2 && inviteName.trim() === "" })}
      ${gone ? "" : btn(t("notNow"), "ghost")}
    </div>`;
}

function invite() {
  return `<section class="center-screen">${inviteCard()}</section>`;
}

function otherTab() {
  return `<section class="center-screen">
    <div class="center-card other-tab-card">
      <span class="big-icon">${ICON.tabs}</span>
      <h1>${t("otherTab")}</h1>
      <p class="lead">${t("otherTabBody")}</p>
      ${btn(t("continueHere"), "primary big")}
    </div>
  </section>`;
}

// ---------- game ----------
function moveCount(board) {
  return board.flat().filter(Boolean).length;
}

function game() {
  const G = S.game;
  const mode = S.room.mode;
  const offline = (S.connection ?? "online") !== "online";
  const opp = G.you === "green" ? "pink" : "green";
  const oppName = G.players[opp]?.nickname ?? "";
  const played = moveCount(G.board);
  const finished = G.status === "finished";
  const myTurn = G.status === "playing" && G.turn === G.you && !offline;

  // status line on top of the board
  let head;
  if (finished) {
    head = {
      tok: G.winner ?? "draw",
      title: t("gameOver"),
      chip: t("moveNo", { n: played }).replace(/第 (\d+) 手/, "共 $1 手"),
    };
    if (lang === "en") head.chip = `${played} moves`;
  } else if (G.status === "thinking") {
    // the solver usually answers at once; the label only appears after 300ms
    head = { tok: "pink", title: t("aiThinking"), chip: t("moveNo", { n: played + 1 }), cls: "thinking", dots: true };
  } else if (G.status === "paused") {
    head = {
      tok: opp,
      title: t("paused", { name: oppName }),
      chip: `0:${String(G.graceLeft).padStart(2, "0")}`,
      note: t("pausedBody"),
      cls: "paused",
      ring: G.graceLeft / 30,
    };
  } else if (G.status === "error") {
    head = { icon: ICON.warn, title: t("solverError"), chip: t("moveNo", { n: played + 1 }), cls: "error" };
  } else if (myTurn) {
    head = { tok: G.you, title: t("yourTurn"), hint: t("yourTurnHint"), chip: t("moveNo", { n: played + 1 }), cls: "mine" };
  } else if (offline) {
    head = { tok: G.you, title: t("yourTurn"), chip: t("moveNo", { n: played + 1 }), cls: "muted" };
  } else {
    head = { tok: G.turn, title: t("opponentTurn", { name: oppName }), chip: t("moveNo", { n: played + 1 }), cls: "theirs", dots: true };
  }

  const headHtml = (extraCls = "") => `<div class="board-head ${head.cls ?? ""} ${extraCls}" role="status" aria-live="polite">
      <div class="turn-status">
        ${head.icon ? `<span class="status-icon">${head.icon}</span>` : head.tok === "draw" ? `<span class="draw-pair">${token("green", "status-token")}${token("pink", "status-token")}</span>` : token(head.tok, "status-token")}
        <strong>${head.title}</strong>
        ${head.dots ? '<span class="dots thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>' : ""}
        ${head.hint ? `<span class="hint">${head.hint}</span>` : ""}
      </div>
      <span class="move-chip${head.ring !== undefined ? " countdown" : ""}"${head.ring !== undefined ? ` style="--p:${head.ring}"` : ""}>${head.ring !== undefined ? '<i class="ring"></i>' : ""}${head.chip}</span>
      ${head.note ? `<p class="head-note">${head.note}</p>` : ""}
    </div>`;

  // rail above the board
  let rail = "";
  if (myTurn && G.hover !== undefined) {
    rail = `<div class="hand" style="--col:${G.hover}">${token(G.you, "in-hand")}<span class="drop-cue"></span></div>`;
  }

  // board cells
  const win = new Set(G.winning_cells.map(({ row, column }) => `${row}:${column}`));
  const landing =
    myTurn && G.hover !== undefined
      ? G.board.findLastIndex((row) => row[G.hover] === null)
      : -1;
  const cells = G.board
    .flatMap((row, r) =>
      row.map((cell, c) => {
        const cls = ["cell"];
        let inner = token(cell);
        if (r === landing && c === G.hover) {
          cls.push("is-preview");
          inner = token(G.you, "ghost");
        }
        if (cell && G.last && G.last.row === r && G.last.column === c) cls.push("is-last");
        if (win.has(`${r}:${c}`)) cls.push("is-win");
        return `<div class="${cls.join(" ")}" data-r="${r}" data-c="${c}">${inner}</div>`;
      }),
    )
    .join("");

  const disabled = !myTurn;
  let overlay = "";
  if (offline) {
    overlay = `<div class="board-overlay"><div class="overlay-card">${ICON.wifiOff}<strong>${t("gameOffline")}</strong><small>${t("gameOfflineBody")}</small></div></div>`;
  } else if (G.status === "error") {
    overlay = `<div class="board-overlay plain"></div>`;
  }

  const boardHtml = `<div class="board-unit">
      ${headHtml("in-unit")}
      <div class="rail">${rail}</div>
      <div class="board${disabled ? " is-disabled" : ""}${finished ? " is-finished" : ""}" style="--hc:${myTurn ? G.hover ?? -9 : -9}">
        ${myTurn && G.hover !== undefined ? '<span class="col-hover"></span>' : ""}
        <div class="grid">${cells}</div>
        ${G.winning_cells.length ? '<svg class="win-line" aria-hidden="true"><line /></svg>' : ""}
        ${overlay}
      </div>
    </div>`;

  // match card
  const modeLabel =
    mode === "ai"
      ? t("modeAi")
      : mode === "private"
        ? `${t("modePrivate")} <b class="code">${esc(S.room.code)}</b>`
        : t("modeMatch");
  const player = (colour) => {
    const p = G.players[colour] ?? { nickname: "", connected: true };
    const isMe = colour === G.you;
    // protocol: who moves first is no longer tied to colour (rematch alternates it)
    const seat = colour === (G.first ?? "green") ? t("first") : t("second");
    const meta = isMe ? `${t("you")} · ${seat}` : p.is_ai ? `${seat} · ${t("solver")}` : seat;
    const current = G.status === "playing" && G.turn === colour;
    const away = !p.connected;
    const ring =
      away && G.status === "paused"
        ? `<i class="token-ring" style="--p:${G.graceLeft / 30}"></i>`
        : "";
    let tag = "";
    if (current && isMe && !offline) tag = `<span class="turn-tag">${t("yourTurn")}</span>`;
    else if (away) tag = `<span class="presence-tag off">${t("offlineTag")}</span>`;
    else if (!isMe) tag = `<span class="presence-tag"><i></i>${t("online")}</span>`;
    return `<div class="player${colour === "pink" ? " right" : ""}${current ? " is-current" : ""}${away ? " is-away" : ""}${isMe ? " is-me" : ""}">
        <span class="player-token-wrap">${token(colour, "player-token")}${ring}</span>
        <span class="player-copy"><strong>${esc(p.nickname)}</strong><small>${meta}</small></span>
        ${tag}
      </div>`;
  };
  const series = G.series
    ? `<div class="series"><span>${t("series")}</span><b>${G.series.you}</b><i>:</i><b>${G.series.opponent}</b></div>`
    : "";
  const matchCard = `<div class="card match-card">
      <p class="mode-label">${modeLabel}</p>
      ${player("green")}
      <div class="versus"><span>${t("versus")}</span></div>
      ${player("pink")}
      ${series}
    </div>`;

  const lastCol = G.last ? G.last.column + 1 : null;
  const lastColour = G.last ? G.board[G.last.row][G.last.column] : null;
  const infoCard = `<div class="card info-card">
      <div><small>${t("first")}</small><strong>${G.you === (G.first ?? "green") ? t("you") : esc(G.players[G.first ?? "green"]?.nickname ?? "")}</strong></div>
      <div><small>${t("lastMove")}</small><strong>${lastCol ? `${token(lastColour, "stat-token")}${t("columnN", { n: lastCol })}` : "—"}</strong></div>
    </div>`;

  // result card (finished / error)
  let result = "";
  if (finished || G.status === "error") {
    const r = G.result_reason;
    const iWon = G.winner === G.you;
    let title;
    let sub;
    let tone;
    let emblem = token(G.winner ?? G.you, "emblem");
    let actions = [];
    const again = mode === "ai" ? t("challengeAgain") : t("rematch");
    if (G.status === "error") {
      title = t("solverError");
      sub = t("solverErrorBody");
      tone = "error";
      emblem = `<span class="emblem-icon">${ICON.warn}</span>`;
      actions = [btn(t("restart"), "primary", { icon: ICON.restart }), btn(t("leave"), "secondary")];
    } else if (r === "draw") {
      title = t("draw");
      sub = t("drawSub");
      tone = "draw";
      emblem = `<span class="emblem-pair">${token("green", "emblem")}${token("pink", "emblem")}</span>`;
      actions = [btn(again, "primary"), btn(t("leave"), "secondary")];
    } else if (r === "left") {
      title = t("left", { name: oppName });
      sub = t("leftSub");
      tone = "win";
    } else if (r === "forfeit" && iWon) {
      title = t("forfeitWin", { name: oppName });
      sub = t("forfeitWinSub");
      tone = "win";
      actions = [btn(again, "primary"), btn(t("leave"), "secondary")];
    } else if (r === "forfeit") {
      title = t("forfeitLose");
      sub = t("forfeitLoseSub");
      tone = "lose";
      emblem = `<span class="emblem-icon">${ICON.wifiOff}</span>`;
      actions = [btn(again, "primary"), btn(t("leave"), "secondary")];
    } else if (iWon) {
      title = t("win");
      sub = t("winSub", { n: played });
      tone = "win";
      actions = [btn(again, "primary"), btn(t("leave"), "secondary")];
    } else {
      title = mode === "ai" ? t("loseAi") : t("lose", { name: oppName });
      sub = mode === "ai" ? t("loseAiSub") : t("winSub", { n: played });
      tone = "lose";
      actions = [btn(again, "primary", { icon: mode === "ai" ? ICON.restart : "" }), btn(t("leave"), "secondary")];
    }
    // protocol: game.rematch {green, pink} + game.rematch_available
    const mine = G.rematch?.[G.you];
    const theirs = G.rematch?.[opp];
    let rematchRow = "";
    if (finished && mode !== "ai" && G.rematch_available === false) {
      actions = [btn(t("backToLobby"), "primary", { icon: ICON.back })];
      // left after the game was already decided: result_reason keeps its value
      if (r !== "left") {
        rematchRow = `<div class="rematch-row">${ICON.back}<div><strong>${t("leftAfter", { name: oppName })}</strong></div></div>`;
      }
    } else if (finished && mine) {
      actions = [btn(t("rematchWaitingBtn"), "primary is-waiting", { disabled: true }), btn(t("leave"), "secondary")];
      rematchRow = `<div class="rematch-row"><span class="dots"><i></i><i></i><i></i></span><div><strong>${t("rematchSent", { name: oppName })}</strong><small>${t("rematchPending", { name: oppName })}</small></div></div>`;
    } else if (finished && theirs) {
      actions = [btn(t("rematchAccept"), "primary"), btn(t("leave"), "secondary")];
      rematchRow = `<div class="rematch-row incoming">${token(opp, "stat-token")}<div><strong>${t("rematchIncoming", { name: oppName })}</strong><small>${t("rematchIncomingSub", { name: G.you === (G.first ?? "green") ? oppName : t("you") })}</small></div></div>`;
    }
    // outcome colours are not the player colours: trophy / flag / equals
    const icon = { win: ICON.trophy, lose: ICON.flag, draw: ICON.equal, error: ICON.warn }[tone];
    if (!(r === "forfeit" && !iWon)) emblem = `<span class="emblem-icon">${icon}</span>`;
    result = `<div class="card result-card ${tone}" role="status">
        <div class="result-top">${emblem}<div><h2>${title}</h2><p>${sub}</p></div></div>
        ${rematchRow}
        <div class="result-actions">${actions.join("")}</div>
      </div>`;
  }

  const actions =
    result === ""
      ? `<div class="actions">${btn(t("leave"), "secondary")}</div>`
      : "";
  const kbd = myTurn
    ? `<p class="kbd-hint"><kbd>←</kbd><kbd>→</kbd> ${t("kbdPick")}　<kbd>Enter</kbd> ${t("kbdDrop")}</p>`
    : "";

  return `<section class="game status-${G.status}${finished ? " is-finished" : ""}${offline ? " is-offline" : ""}">
    ${boardHtml}
    <aside class="side">
      ${headHtml("in-side")}
      ${result}
      ${matchCard}
      ${infoCard}
      ${actions}
      ${kbd}
    </aside>
  </section>`;
}

// ---------- overlays ----------
function toast() {
  if (!S.toast) return "";
  return `<div class="toast" role="alert"><span class="toast-icon">!</span><span>${t(S.toast)}</span><button type="button" aria-label="${t("close")}">${ICON.close}</button></div>`;
}

// round 17 proposal: app-only privacy policy line at the foot of the sheet
// (pp=a: the link alone; pp=b: link · app version). Not shown on the website.
function privacyLine() {
  const pp = params.get("pp");
  if (!pp) return "";
  const link = `<a class="privacy-link" href="#">${t("privacyPolicy")}</a>`;
  if (pp === "b") return `<p class="privacy-line">${link}<span aria-hidden="true">·</span><span>${t("appVersion", { v: "3.1.0" })}</span></p>`;
  return `<p class="privacy-line">${link}</p>`;
}

function profileSheet() {
  if (!S.profile) return "";
  const P = S.profile;
  // an empty (or all-space) nickname is caught while typing: pink field,
  // "enter a nickname first", Save disabled (user ruling 2026-09-24)
  const empty = P.error && P.nickname.trim() === "";
  return `<div class="scrim">
    <form class="profile-sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h2>${t("profileTitle")}</h2>
      <label><span class="field-label">${t("nickname")}</span>
        <input class="${P.error ? "has-error" : ""}${vp === "keyboard" || focusDemo ? " is-focused" : ""}" value="${esc(P.nickname)}" maxlength="18" />
      </label>
      ${P.error ? `<p class="form-error" id="nickname-error" role="alert">${ICON.warn}${empty ? t("errNicknameEmpty") : t("errNickname")}</p>` : ""}
      <label><span class="field-label">${t("language")}</span>
        <span class="select-field"><select><option>${lang === "en" ? t("english") : t("chinese")}</option></select>${ICON.chevron}</span>
      </label>
      <div class="sheet-actions">${btn(t("cancel"), "secondary")}${btn(t("save"), "primary", { disabled: empty })}</div>
      ${privacyLine()}
    </form>
  </div>`;
}

function keyboard() {
  if (vp !== "keyboard") return "";
  const rowsKeys = ["ㄅㄉˇˋㄓˊ˙ㄚㄞㄢ", "ㄆㄊㄍㄐㄔㄗㄧㄛㄟㄣ", "ㄇㄋㄎㄑㄕㄘㄨㄜㄠ", "ㄈㄌㄏㄒㄖㄙㄩ"];
  const keys = rowsKeys
    .map((row) => `<div class="kb-row">${[...row].map((k) => `<span>${k}</span>`).join("")}</div>`)
    .join("");
  return `<div class="ios-keyboard" aria-hidden="true">
    <div class="kb-suggest"><span>曜宇</span><span>曜</span><span>宇</span></div>
    ${keys}
    <div class="kb-row kb-bottom"><span class="wide">123</span><span class="space">空格</span><span class="wide">換行</span></div>
  </div>`;
}

// ---------- mount ----------
const view =
  S.view === "lobby"
    ? lobby()
    : S.view === "searching"
      ? searching()
      : S.view === "waiting"
        ? waiting()
        : S.view === "otherTab"
          ? otherTab()
          : S.view === "invite"
            ? invite()
            : game();

document.body.innerHTML = `<div class="app view-${S.view}${S.profile ? " has-sheet" : ""}">
  ${deviceFrame()}
  ${topbar()}
  <main>${view}</main>
  ${toast()}
  ${profileSheet()}
  ${keyboard()}
</div>`;

// draw the winning line through the centres of the winning cells
const line = document.querySelector(".win-line line");
if (line) {
  const board = document.querySelector(".board").getBoundingClientRect();
  const cells = [...document.querySelectorAll(".cell.is-win")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - board.left, y: r.top + r.height / 2 - board.top };
  });
  cells.sort((a, b) => a.x - b.x || a.y - b.y);
  const [a, b] = [cells[0], cells[cells.length - 1]];
  const svgEl = document.querySelector(".win-line");
  svgEl.setAttribute("viewBox", `0 0 ${board.width} ${board.height}`);
  line.setAttribute("x1", a.x);
  line.setAttribute("y1", a.y);
  line.setAttribute("x2", b.x);
  line.setAttribute("y2", b.y);
}
