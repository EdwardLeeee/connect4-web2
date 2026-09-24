// Storyboards: story.html?id=A01 … A10. Each frame is a real scene built from
// base.css + motion.css; after layout every animation inside a frame is
// paused at that frame's time (data-t, ms) so the picture equals the CSS.
const id = new URLSearchParams(location.search).get("id") ?? "A01";
const T = window.STRINGS["zh-TW"];
const t = (key, vars = {}) => (T[key] ?? key).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? "");

const tok = (colour, extra = "", style = "") =>
  `<i class="token ${colour} ${extra}"${style ? ` style="${style}"` : ""}></i>`;

const CONFETTI_COLOURS = ["var(--mint)", "var(--pink)", "var(--sun)", "var(--white)"];

const ICON_TROPHY =
  '<svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4"/><path d="M12 13v4M8.5 20h7M9.5 17h5"/></svg>';

// rows: strings; G/P token, g/p ghost, D/E dropping green/pink, . empty
function board(rows, o = {}) {
  const cols = rows[0].length;
  const win = o.win ?? [];
  const cells = rows
    .flatMap((row, r) =>
      [...row].map((ch, c) => {
        const cls = ["cell"];
        let inner = "";
        if (ch === "G") inner = tok("green");
        if (ch === "P") inner = tok("pink");
        if (ch === "g") inner = tok("green", "ghost");
        if (ch === "p") inner = tok("pink", "ghost");
        if (ch === "D" || ch === "E") {
          const rowsFallen = r;
          const fall = o.fall ?? `calc(${rowsFallen + 1} * (var(--slot) + var(--slot-gap)) + 12px)`;
          const dur = 260 + 30 * rowsFallen;
          inner = tok(ch === "D" ? "green" : "pink", "is-dropping", `--fall:${fall};--drop-dur:${dur}ms`);
        }
        if (o.last === `${r}:${c}`) cls.push("is-last");
        const wi = win.indexOf(`${r}:${c}`);
        if (wi >= 0) cls.push("is-win");
        return `<div class="${cls.join(" ")}"${wi >= 0 ? ` style="--i:${wi}"` : ""}>${inner}</div>`;
      }),
    )
    .join("");
  return `<div class="board${o.disabled ? " is-disabled" : ""}" style="--cols:${cols}${o.hc !== undefined ? `;--hc:${o.hc}` : ""}${o.fc !== undefined ? `;--fc:${o.fc}` : ""}">
    ${o.hc !== undefined ? '<span class="col-hover"></span>' : ""}
    ${o.fc !== undefined ? '<span class="col-focus"></span>' : ""}
    <div class="grid">${cells}</div>
    ${win.length ? '<svg class="win-line"><line /></svg><span class="star s1"></span><span class="star s2"></span>' : ""}
    ${o.finger !== undefined ? `<span class="finger" style="left:calc(var(--bw) + var(--board-pad) + ${o.finger} * (var(--slot) + var(--slot-gap)) + var(--slot) / 2);top:38%"></span>` : ""}
  </div>`;
}

const rail = (inner = "", cols = 7) => `<div class="rail" style="--cols:${cols}">${inner}</div>`;
const hand = (col, colour = "green", extra = "") =>
  `<div class="hand ${extra}" style="--col:${col}">${tok(colour, "in-hand")}</div>`;
const geo = (slot, gap, pad, bw) =>
  `--slot:${slot}px;--slot-gap:${gap}px;--board-pad:${pad}px${bw ? `;--bw:${bw}px` : ""}`;

const B7 = [".......", ".......", ".......", ".......", "..GPG..", "..PGP.."];
const withCell = (rows, r, c, ch) =>
  rows.map((row, i) => (i === r ? row.slice(0, c) + ch + row.slice(c + 1) : row));

const STORIES = {
  A01: {
    title: "落子：重力下落＋壓扁＋回彈＋一次小彈",
    lead: "自己、對手、AI 的每一手都播放；棋子從軌道放開，落到該欄最低的空格。",
    frames: [
      [0, "從軌道放開"],
      [140, "加速下落（ease-in）"],
      [273, "觸底（62%）"],
      [308, "壓扁 1.10 × 0.86"],
      [361, "回彈 12%"],
      [405, "二次小彈"],
      [440, "定位；標上一手框線"],
    ].map(([ms, cap]) => ({
      t: ms,
      cap,
      html: `<div class="scene" style="${geo(52, 8, 10)}">
          ${rail("", 1)}
          ${board(["." , ".", ".", ".", ".", ms >= 440 ? "G" : "D"], { last: ms >= 440 ? "5:0" : undefined, fall: "calc(5 * (var(--slot) + var(--slot-gap)) + var(--slot) + 25px)" })}
        </div>`,
    })),
    spec: [
      ["觸發", "snapshot 多了一顆棋子；用 <code>game.history</code> 最後一碼找出落點。第一次載入、重新連線、切回分頁時不播。"],
      ["時長", "260ms + 30ms × 下落列數：落到最底（6 列）440ms，落到頂列 260ms。"],
      ["曲線", "下落 <code>cubic-bezier(0.55, 0, 1, 0.45)</code>；之後壓扁、回彈 12%、再小彈 3%（<code>motion.css</code> 的 <code>c4-drop</code>）。"],
      ["實作", "只動 <code>transform</code>，<code>transform-origin: 50% 100%</code>；不改 layout，不延後 snapshot 套用。"],
      ["reduced-motion", "不位移：棋子直接出現在落點，上一手框線照常顯示。"],
    ],
  },

  A02: {
    title: "落點預覽：滑鼠、觸控",
    lead: "輪到你時，手上的棋子跟著欄位走，該欄亮起虛線框，落點出現半透明預覽。",
    frames: [
      { t: 5000, cap: "滑鼠移入第 2 欄：棋子在該欄上方，亮框＋預覽", html: scenePreview({ hand: 1, hc: 1, ghost: [5, 1] }) },
      { t: 5000, cap: "移向第 5 欄：棋子水平滑動 140ms；舊亮框與預覽立即移除", html: scenePreview({ hand: 2.6 }) },
      { t: 50, cap: "抵達第 5 欄：亮框與預覽淡入 100ms（此幀 50ms）", html: scenePreview({ hand: 4, hc: 4, ghost: [3, 4] }) },
      { t: 5000, cap: "觸控：手指按下就顯示同樣的預覽", html: scenePreview({ hand: 2, hc: 2, ghost: [3, 2], finger: 2 }) },
      { t: 5000, cap: "拖動：預覽跟著手指換欄", html: scenePreview({ hand: 5, hc: 5, ghost: [5, 5], finger: 5 }) },
      { t: 150, cap: "放開＝落子（接 A01）；拖到棋盤外放開＝取消", html: scenePreview({ hand: null, drop: [5, 5] }) },
    ],
    spec: [
      ["觸發", "只在 <code>status = playing</code> 且輪到自己時；滑鼠 <code>pointerenter</code>、觸控 <code>pointerdown</code>、鍵盤見 A09。"],
      ["棋子滑動", "<code>left</code> 140ms <code>cubic-bezier(0.2, 0.8, 0.2, 1)</code>。"],
      ["亮框與預覽", "淡入並由 0.85 放大到 1，100ms；換欄時舊的立即移除。"],
      ["觸控規則", "點一下仍然直接落子（和現在相同）；按住拖動可換欄；在棋盤外放開就取消。滿欄不顯示預覽。"],
      ["reduced-motion", "棋子直接跳到新欄位上方；亮框與預覽只做 120ms 淡入。"],
    ],
  },

  A03: {
    title: "勝利：約 3 秒的慶祝（連線、墨線、彩紙、獎盃、結局面板）",
    lead: "連線棋子依序彈起、墨線畫過、彩紙從棋盤上方灑落約 1.7 秒、獎盃彈出，結局面板在 1.4 秒時才進場；之後勝利棋子再輕輕脈動 3 次。只在你贏的時候灑彩紙。",
    frames: [0, 300, 700, 1000, 1300, 1600, 2000, 2600, 3200].map((ms) => ({
      t: ms,
      cap: {
        0: "最後一顆落定",
        300: "連線棋子依序彈起（間隔 120ms）",
        700: "墨線畫過四顆（500ms）",
        1000: "星星爆開，彩紙開始灑落",
        1300: "彩紙滿版",
        1600: "結局面板進場（1.4 秒起）",
        2000: "獎盃彈出；勝利棋子開始脈動",
        2600: "彩紙落到底、淡出",
        3200: "完成；面板停住，棋子再脈動 3 次",
      }[ms],
      html: sceneWin2(),
    })),
    spec: [
      ["觸發", "你贏的時候（連四勝、對手離線判負、對手離開）。輸或平手不灑彩紙：輸時只有連線和墨線，面板在 0.9 秒時進場；平手面板直接進場。"],
      ["時間軸", "彈起 0–660ms；墨線 450–950ms；星星 900ms 起；彩紙 900–3200ms（28 片，錯開 0–600ms，每片 1.7 秒）；面板 1400ms 起 420ms；獎盃 1700ms；棋子脈動 2000ms 起 3 次。"],
      ["彩紙", "薄荷、粉紅、向日葵、白四色，2px 墨框；方片、圓片、細條三種形狀；只在棋盤範圍內落下。"],
      ["reduced-motion", "沒有彩紙、沒有脈動；連線與面板一次到位（面板 120ms 淡入）。"],
    ],
  },

  A04: {
    title: "思考中：真人對手與 AI",
    lead: "真人對戰輪到對手時，狀態列顯示「{name} 正在思考」加三點跳動。AI 通常立即落子，只有超過 300ms 還沒回應才顯示「AI 正在思考」，避免閃一下。",
    frames: [0, 150, 300, 450]
      .map((ms) => ({ t: ms, cap: "真人對戰：三點依序跳動，間隔 150ms；軌道保持空白", html: sceneThinking("pvp") }))
      .concat([
        { t: 5000, label: "AI 0–300 ms", cap: "你落子後 AI 開始計算；300ms 內回應就不顯示思考狀態", html: sceneThinking("ai-early") },
        { t: 5000, label: "AI ＞300 ms", cap: "還沒回應才淡入「AI 正在思考」；沒有秒數、沒有超時", html: sceneThinking("ai") },
      ]),
    spec: [
      ["真人對戰", "<code>playing</code> 且輪到對手：狀態列「{name} 正在思考」＋三點，<code>c4-dots</code> 900ms 無限循環，間隔 150ms。軌道不顯示對手的滑鼠位置。"],
      ["AI", "<code>status = thinking</code> 持續超過 300ms 才淡入「AI 正在思考」＋三點；300ms 內就落子則直接播 A01。"],
      ["規則", "求解器不加超時、不顯示秒數或「放棄」；求解器故障走 P12。"],
      ["reduced-motion", "三點靜止，只顯示文字。"],
    ],
  },

  A05: {
    title: "對手離線：30 秒倒數",
    lead: "對手斷線時，狀態列與對手頭像同步倒數；最後 10 秒轉粉紅並脈動。對手回來就收起，逾時則進入 P10。",
    frames: [
      [0, "0:30 開始倒數"],
      [12000, "0:18 圓環持續減少"],
      [20000, "0:10 轉粉紅並開始脈動"],
      [20500, "脈動高點 1.06 倍"],
      [27000, "0:03"],
    ].map(([ms, cap]) => ({ t: ms, label: `${ms / 1000} s`, cap, html: scenePaused(ms) })).concat([
      { t: 5000, cap: "對手回來：倒數收起，提示「小安 回來了」2 秒", html: sceneBack() },
      { t: 5000, cap: "逾時：進入 P10（你獲勝）", html: sceneTimeout() },
    ]),
    spec: [
      ["觸發", "<code>status = paused</code> 且 <code>players[對手].grace_deadline</code> 有值。"],
      ["時間", "剩餘秒數 = <code>grace_deadline − server_time</code>，再以收到 snapshot 的本機時間往下數；欄位變成 null 時只顯示文字、不顯示數字。"],
      ["圓環", "<code>c4-ring</code> 30s linear，狀態列與對手頭像兩處同步。"],
      ["最後 10 秒", "倒數籤轉粉紅，<code>c4-pulse</code> 1000ms 無限循環。"],
      ["回來", "倒數收起；狀態列顯示「{name} 回來了」2 秒，再回到一般回合狀態。"],
      ["reduced-motion", "圓環每秒跳一格（steps），不脈動，只變色。"],
    ],
  },

  A06: {
    title: "等待：配對中的跳動棋子、複製房號回饋",
    lead: "配對等待時三顆棋子依序跳動。等朋友時桌機只有「複製邀請連結」一顆按鈕，按下彈一下並改成「已複製邀請連結」，之後維持不變；手機只有「分享邀請」，跳出系統分享選單。",
    frames: [0, 150, 300, 450, 600]
      .map((ms) => ({ t: ms, cap: "三顆依序跳起，間隔 150ms", html: `<div class="scene" style="padding:10px"><div class="searching-anim"><span class="lane">${tok("green")}${tok("pink")}${tok("green")}</span></div></div>` }))
      .concat([
        { t: 5000, cap: "桌機：複製前", html: `<div class="scene" style="padding:20px">${btnHtml(t("copyLink"), "primary")}</div>` },
        { t: 90, cap: "按下：90ms 彈到 1.06，改成「已複製邀請連結」", html: `<div class="scene" style="padding:20px">${btnHtml("✓ " + t("copiedLink"), "primary is-done")}</div>` },
        { t: 5000, cap: "之後一直維持「已複製邀請連結」，不變回原字", html: `<div class="scene" style="padding:20px">${btnHtml("✓ " + t("copiedLink"), "primary is-done")}</div>` },
      ]),
    spec: [
      ["配對中", "<code>hop</code> 900ms 無限循環，三顆依序延遲 0／150／300ms，上跳 18px 並傾斜 12°。"],
      ["等待時間", "「已等待 0:12」從進入配對起算，每秒更新；純前端計時。"],
      ["複製（桌機）", "<code>c4-pop</code> 180ms；按過之後維持「✓ 已複製邀請連結」直到離開等待畫面，不自動恢復（使用者決定）。複製失敗仍走錯誤 toast。"],
      ["分享（手機）", "唯一的按鈕「分享邀請」呼叫 <code>navigator.share({ title, text, url })</code>；瀏覽器不支援時，這顆按鈕改成「複製邀請連結」，行為同桌機。使用者取消分享選單不算錯誤。"],
      ["reduced-motion", "棋子靜止；複製只換字不彈跳。"],
    ],
  },

  A07: {
    title: "大廳 → 對局 轉場",
    lead: "按下開始後，大廳下沉淡出，對局畫面從下方升起，最後狀態籤彈一下。",
    frames: [0, 80, 160, 280, 400, 480, 560].map((ms) => ({
      t: ms,
      cap:
        { 0: "按下「立即對戰」：按鈕陷入 3px", 80: "大廳下沉 12px 淡出", 160: "大廳消失；對局開始升起", 280: "對局升起中（ease-out）", 400: "到位；狀態籤開始彈出", 480: "狀態籤回正", 560: "完成" }[ms],
      html: sceneTransition(),
    })),
    spec: [
      ["觸發", "路由 / → /play（任何模式開局、進入配對或等朋友）；反向 /play → / 用同一組曲線倒放。"],
      ["大廳離開", "<code>c4-view-out</code> 160ms ease-in：淡出並下移 12px。"],
      ["對局進場", "<code>c4-view-in</code> 延遲 160ms，240ms ease-out：由下方 24px 升起。"],
      ["狀態籤", "延遲 400ms，160ms ease-back 從 0.9 倍彈回。"],
      ["reduced-motion", "120ms 交叉淡入淡出，不位移。"],
    ],
  },

  A08: { title: "reduced-motion：每個動效的靜態替代", lead: "系統開啟「減少動態效果」時，所有位移、縮放、循環都停止；只保留 ≤120ms 的淡入淡出。", reduced: true },

  A09: {
    title: "鍵盤操作",
    lead: "棋盤是一個 Tab 停駐點；←／→ 換欄、Enter 或空白鍵落子。焦點框（純墨色）、手上棋子、預覽三者一致，螢幕閱讀器朗讀欄位與結果。",
    frames: [
      { t: 5000, keys: ["Tab"], sr: "棋盤，第 4 欄，可以落子", cap: "Tab 進入棋盤：焦點在上次停留的欄（預設第 4 欄）", html: sceneKeys({ fc: 3, ghost: [3, 3] }) },
      { t: 5000, keys: ["→"], sr: "第 5 欄，可以落子", cap: "→ 換到第 5 欄", html: sceneKeys({ fc: 4, ghost: [3, 4] }) },
      { t: 5000, keys: ["→"], sr: "第 6 欄，可以落子", cap: "→ 換到第 6 欄", html: sceneKeys({ fc: 5, ghost: [5, 5] }) },
      { t: 200, keys: ["Enter"], sr: "你在第 6 欄落子", cap: "Enter 落子（接 A01）；焦點留在第 6 欄", html: sceneKeys({ fc: 5, drop: [5, 5] }) },
      { t: 5000, keys: [], sr: "AI 正在思考", cap: "對手回合：焦點框變灰，按鍵只朗讀狀態", html: sceneKeys({ fc: 5, placed: [5, 5], waiting: true }) },
    ],
    spec: [
      ["結構", "棋盤一個 Tab 停駐點（roving tabindex），內部 7 個欄位按鈕用 ←／→ 移動；Home／End 到第 1／7 欄。"],
      ["落子", "Enter 或空白鍵；滿欄時不落子，朗讀「第 N 欄已滿」。"],
      ["焦點框", "3px 墨色實線，沒有外暈（使用者 2026-09-24：改黑的）；非自己回合時改成灰色框，同樣沒有外暈，不可落子。"],
      ["朗讀", "<code>aria-live=polite</code>：換欄時「第 N 欄，可以落子」、落子後「你在第 N 欄落子」、對手落子後「對手在第 N 欄落子」。"],
      ["現況差異", "目前欄位按鈕是 <code>tabindex=-1</code>，鍵盤完全無法下棋；這是新增能力。"],
    ],
  },

  A10: {
    title: "大廳迷你棋盤演示（循環 6 秒）",
    lead: "「挑戰 AI」卡片裡的小棋盤自己演示「致勝的那一手」，讓大廳有遊戲感。卡片不在畫面內或分頁隱藏時暫停。",
    frames: [
      { t: 5000, label: "0–0.8 s", cap: "0–0.8 秒：預覽棋子在致勝格上閃爍", html: sceneMini({ ghost: true }) },
      { t: 150, label: "0.8 s", cap: "0.8 秒：薄荷棋子落下（A01 縮小版）", html: sceneMini({ drop: true }) },
      { t: 700, label: "1.3 s", cap: "1.3 秒：四顆放大、墨線畫過（A03 縮小版）", html: sceneMini({ win: true }) },
      { t: 5000, label: "1.3–4.5 s", cap: "1.3–4.5 秒：停住展示", html: sceneMini({ win: true }) },
      { t: 5000, label: "4.5–6 s", cap: "4.5–6 秒：淡出重置，回到第一幀", html: sceneMini({ ghost: true, faded: true }) },
    ],
    spec: [
      ["循環", "6 秒；用 IntersectionObserver 與 <code>visibilitychange</code> 在看不到時暫停。"],
      ["內容", "固定棋譜（不連伺服器），只示範一條斜線致勝。"],
      ["reduced-motion", "只顯示第一幀（含預覽棋子），不循環。"],
    ],
  },
};

function btnHtml(label, kind) {
  return `<button class="btn ${kind}" type="button" style="min-width:180px"><span>${label}</span></button>`;
}

function scenePreview({ hand: h, hc, ghost, finger, drop }) {
  let rows = B7;
  if (ghost) rows = withCell(rows, ghost[0], ghost[1], "g");
  if (drop) rows = withCell(rows, drop[0], drop[1], "D");
  return `<div class="scene" style="${geo(34, 6, 8)}">
    ${rail(h === null || h === undefined ? "" : hand(h))}
    ${board(rows, { hc, finger })}
  </div>`;
}

function sceneWin() {
  const rows = [".......", ".......", "....G..", "...GP..", "..GPGG.", "PGPGPP."];
  return `<div class="scene" style="${geo(34, 6, 8)};flex-direction:row;align-items:center;gap:22px">
    ${board(rows, { win: ["5:1", "4:2", "3:3", "2:4"], last: "2:4" })}
    <div class="card result-card win" style="width:230px">
      <div class="result-top" style="padding:12px 14px">${tok("green", "emblem")}<div><h2 style="font-size:22px">${t("win")}</h2><p style="font-size:13px">${t("winSub", { n: 13 })}</p></div></div>
      <div class="result-actions" style="padding:12px;gap:8px"><button class="btn primary" style="min-height:40px;font-size:15px">${t("rematch")}</button><button class="btn secondary" style="min-height:40px;font-size:15px">${t("leave")}</button></div>
    </div>
  </div>`;
}

function confetti(n = 28) {
  return Array.from({ length: n }, (_, i) => {
    const shape = ["", "round", "strip"][i % 3];
    const x = (i * 37) % 94;
    const dx = ((i * 53) % 120) - 60;
    const r = ((i * 97) % 720) - 360;
    const d = 900 + ((i * 131) % 600);
    const fall = 300 + ((i * 71) % 60);
    return `<i class="confetti ${shape}" style="--x:${x}%;--dx:${dx}px;--r:${r}deg;--d:${d}ms;--fall-h:${fall}px;--c:${CONFETTI_COLOURS[i % 4]}"></i>`;
  }).join("");
}

function confettiLayer() {
  return `<span class="confetti-layer">${confetti()}</span>`;
}

function sceneWin2() {
  const rows = [".......", ".......", "....G..", "...GP..", "..GPGG.", "PGPGPP."];
  const b = board(rows, { win: ["5:1", "4:2", "3:3", "2:4"], last: "2:4" }).replace('<div class="grid">', `${confettiLayer()}<div class="grid">`);
  return `<div class="scene" style="${geo(34, 6, 8)};flex-direction:row;align-items:center;gap:22px">
    ${b}
    <div class="card result-card win" style="width:230px">
      <div class="result-top" style="padding:12px 14px"><span class="emblem-icon">${ICON_TROPHY}</span><div><h2 style="font-size:22px">${t("win")}</h2><p style="font-size:13px">${t("winSub", { n: 13 })}</p></div></div>
      <div class="result-actions" style="padding:12px;gap:8px"><button class="btn primary" style="min-height:40px;font-size:15px">${t("rematch")}</button><button class="btn secondary" style="min-height:40px;font-size:15px">${t("leave")}</button></div>
    </div>
  </div>`;
}


function sceneThinking(kind) {
  const rows = [".......", ".......", ".......", "....G..", "..GPG..", "..PGP.."];
  const label = kind === "pvp" ? t("opponentTurn", { name: "玩家 4821" }) : kind === "ai" ? t("aiThinking") : t("yourTurn");
  const colour = kind === "ai-early" ? "green" : "pink";
  const dots = kind === "ai-early" ? "" : '<span class="dots thinking-dots"><i></i><i></i><i></i></span>';
  return `<div class="scene" style="${geo(30, 5, 7)};align-items:stretch;width:280px">
    <div class="board-head ${kind === "ai-early" ? "muted" : "theirs"}" style="min-height:40px">
      <div class="turn-status" style="padding:3px 12px 3px 4px">${tok(colour, "status-token", "width:24px;height:24px")}<strong style="font-size:15px">${label}</strong>${dots}</div>
    </div>
    ${rail("")}
    ${board(rows, { disabled: true, last: "3:4" })}
  </div>`;
}

function scenePaused(ms) {
  const left = 30 - Math.floor(ms / 1000);
  const urgent = left <= 10;
  return `<div class="scene" style="align-items:stretch;gap:14px;width:340px">
    <div class="board-head paused" style="min-height:40px">
      <div class="turn-status" style="padding:3px 12px 3px 4px">${tok("pink", "status-token", "width:24px;height:24px")}<strong style="font-size:16px">${t("paused", { name: "小安" })}</strong></div>
      <span class="move-chip countdown${urgent ? " is-urgent" : ""}"><i class="ring"></i>0:${String(left).padStart(2, "0")}</span>
    </div>
    <div class="card" style="padding:10px"><div class="player is-away" style="min-height:60px">
      <span class="player-token-wrap">${tok("pink", "player-token")}<i class="token-ring"></i></span>
      <span class="player-copy"><strong>小安</strong><small>${t("second")}</small></span>
      <span class="presence-tag off">${t("offlineTag")}</span>
    </div></div>
  </div>`;
}

function sceneBack() {
  return `<div class="scene" style="align-items:stretch;gap:14px;width:340px">
    <div class="board-head mine" style="min-height:40px"><div class="turn-status" style="padding:3px 12px 3px 4px">${tok("green", "status-token", "width:24px;height:24px")}<strong style="font-size:16px">${t("reconnected", { name: "小安" })}</strong></div><span class="move-chip">${t("moveNo", { n: 13 })}</span></div>
    <div class="card" style="padding:10px"><div class="player" style="min-height:60px">
      <span class="player-token-wrap">${tok("pink", "player-token")}</span>
      <span class="player-copy"><strong>小安</strong><small>${t("second")}</small></span>
      <span class="presence-tag"><i></i>${t("online")}</span>
    </div></div>
  </div>`;
}

function sceneTimeout() {
  return `<div class="scene" style="width:300px">
    <div class="card result-card win" style="width:100%;animation:none">
      <div class="result-top" style="padding:12px 14px">${tok("green", "emblem")}<div><h2 style="font-size:20px">${t("forfeitWin", { name: "小安" })}</h2><p style="font-size:13px">${t("forfeitWinSub")}</p></div></div>
    </div>
  </div>`;
}

function sceneTransition() {
  const mini = [".......", ".......", "....g..", "...GP..", "..GPG..", ".GPGP.."];
  return `<div class="scene"><div class="mini-screen">
    <div class="layer view-leave">
      <div style="padding:10px;border:3px solid var(--ink);border-radius:14px;background:var(--sun-soft);box-shadow:4px 4px 0 var(--ink);display:grid;gap:8px;justify-items:center;${geo(12, 3, 4, 1.5)}">
        <strong style="font-size:14px">${t("aiTitle")}</strong>
        ${board(mini)}
        <span class="btn primary" style="min-height:28px;padding:2px 12px;font-size:12px;box-shadow:1px 1px 0 var(--ink);transform:translate(3px,3px)">${t("aiAction")} →</span>
      </div>
    </div>
    <div class="layer view-enter" style="flex-direction:column;gap:8px;${geo(16, 4, 5, 1.5)}">
      <div class="board-head mine" style="min-height:0;width:100%;justify-content:center"><div class="turn-status" style="padding:2px 10px 2px 3px;box-shadow:2px 2px 0 var(--ink)">${tok("green", "status-token", "width:18px;height:18px")}<strong style="font-size:13px">${t("yourTurn")}</strong></div></div>
      ${board([".......", ".......", ".......", ".......", ".......", "......."])}
    </div>
  </div></div>`;
}

function sceneKeys({ fc, ghost, drop, placed, waiting }) {
  let rows = B7;
  if (ghost) rows = withCell(rows, ghost[0], ghost[1], "g");
  if (drop) rows = withCell(rows, drop[0], drop[1], "D");
  if (placed) rows = withCell(rows, placed[0], placed[1], "G");
  return `<div class="scene${waiting ? " focus-idle" : ""}" style="${geo(30, 5, 7, 2)}">
    ${rail(waiting || drop ? "" : hand(fc))}
    ${board(rows, { fc, last: placed ? `${placed[0]}:${placed[1]}` : undefined })}
  </div>`;
}

function sceneMini({ ghost, drop, win, faded }) {
  let rows = [".......", ".......", "....g..", "...GP..", "..GPG..", ".GPGP.."];
  if (!ghost) rows = withCell(rows, 2, 4, drop ? "D" : "G");
  return `<div class="scene" style="${geo(24, 4, 6, 2)}${faded ? ";opacity:.35" : ""}">
    <div class="mini-board" style="padding:0;border:0;box-shadow:none;background:none">${board(rows, { win: win ? ["5:1", "4:2", "3:3", "2:4"] : [] })}</div>
  </div>`;
}

function reducedGrid() {
  const cards = [
    ["A01 落子", "不位移，棋子直接出現在落點；上一手框線照常。", board([".", ".", ".", ".", "G", "P"], { last: "4:0" })],
    ["A02 預覽", "棋子直接跳到新欄位上方；亮框與預覽 120ms 淡入。", board(withCell(B7, 3, 4, "g"), { hc: 4 })],
    ["A03 勝利", "連線與放大一次到位；沒有彩紙、星星、脈動；結局面板 120ms 淡入。", board(["....G..", "...GP..", "..GPGG.", "PGPGPP."], { win: ["3:1", "2:2", "1:3", "0:4"] })],
    ["A04 思考", "三點靜止，只顯示「正在思考」文字。", `<div class="board-head theirs"><div class="turn-status" style="padding:3px 10px 3px 4px">${tok("pink", "status-token", "width:20px;height:20px")}<strong style="font-size:13px">${t("aiThinking")}</strong><span class="dots thinking-dots"><i></i><i></i><i></i></span></div></div>`],
    ["A05 倒數", "圓環每秒跳一格，不脈動；最後 10 秒只變粉紅。", `<span class="move-chip countdown is-urgent" style="--p:.3;animation:none"><i class="ring" style="animation:none"></i>0:09</span>`],
    ["A06 等待", "棋子靜止；「已複製」只換字、不彈跳。", `<div class="searching-anim"><span class="lane">${tok("green")}${tok("pink")}${tok("green")}</span></div>`],
    ["A07 轉場", "120ms 交叉淡入淡出，不位移。", `<div class="mini-screen" style="width:220px;height:130px"></div>`],
    ["A10 迷你棋盤", "只顯示第一幀（含預覽棋子），不循環。", `<div class="mini-board" style="padding:0;border:0;box-shadow:none;background:none">${board([".......", ".......", "....g..", "...GP..", "..GPG..", ".GPGP.."])}</div>`],
  ];
  return `<div class="rm-grid">${cards
    .map(([h, p, scene]) => `<div class="rm-card"><h3>${h}</h3><div class="scene" style="${geo(22, 4, 6, 2)}">${scene}</div><p>${p}</p></div>`)
    .join("")}</div>`;
}

// ---------- mount ----------
const S = STORIES[id];
const solo = new URLSearchParams(location.search).get("solo") !== null;
if (solo) S.frames = [S.frames[0]];
document.title = `${id} ${S.title}`;
const frames = S.reduced
  ? reducedGrid()
  : `<div class="frames">${S.frames
      .map(
        (f) => `<figure class="frame" data-t="${f.t}">
          ${f.keys ? `<div class="keys">${f.keys.map((k) => `<span class="key down">${k}</span>`).join("") || "<span style=\"color:var(--muted)\">（無按鍵）</span>"}</div>` : ""}
          ${f.html}
          ${f.sr ? `<div class="sr-bubble">🔈 ${f.sr}</div>` : ""}
          <figcaption><b>${f.label ?? (f.t >= 5000 ? "狀態" : `${f.t} ms`)}</b>${f.cap}</figcaption>
        </figure>`,
      )
      .join("")}</div>`;
const spec = S.spec
  ? `<table class="spec">${S.spec.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>`
  : "";
document.body.innerHTML = `<div class="sb">
  <header class="sb-head"><span class="sb-id">${id}</span><h1>${S.title}</h1><p>${S.lead}</p></header>
  ${frames}
  ${spec}
</div>`;

requestAnimationFrame(() => {
  // winning line + stars at both ends
  for (const b of document.querySelectorAll(".board")) {
    const line = b.querySelector(".win-line line");
    if (!line) continue;
    const box = b.getBoundingClientRect();
    const pts = [...b.querySelectorAll(".cell.is-win")]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
      })
      .sort((a, c) => a.x - c.x || c.y - a.y);
    const [a, z] = [pts[0], pts[pts.length - 1]];
    b.querySelector(".win-line").setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    Object.entries({ x1: a.x, y1: a.y, x2: z.x, y2: z.y }).forEach(([k, v]) => line.setAttribute(k, v));
    line.style.setProperty("--len", Math.hypot(z.x - a.x, z.y - a.y).toFixed(0));
    const s1 = b.querySelector(".star.s1");
    const s2 = b.querySelector(".star.s2");
    s1.style.left = `${a.x - 30}px`;
    s1.style.top = `${a.y + 4}px`;
    s2.style.left = `${z.x + 8}px`;
    s2.style.top = `${z.y - 34}px`;
  }
  requestAnimationFrame(() => {
    for (const f of document.querySelectorAll(".frame")) {
      const ms = Number(f.dataset.t);
      for (const a of f.getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = ms;
      }
    }
    // the reduced-motion sheet and anything outside frames stays static
    for (const a of document.querySelectorAll(".rm-grid")) {
      for (const an of a.getAnimations({ subtree: true })) {
        an.pause();
        an.currentTime = 100000;
      }
    }
    document.body.dataset.ready = "1";
  });
});
