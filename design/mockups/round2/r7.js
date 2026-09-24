// Round 7 animation proposals on top of the real screen renderer:
//   r7-anim.html?state=P07&vp=desktop&opt=win-a|win-b|win-c
//   r7-anim.html?state=P08&vp=desktop&opt=lose-a|lose-b
//   r7-anim.html?state=P03&vp=desktop&opt=think-a|think-b
// Frames are captured by design/tools/r7-capture.mjs, which pauses every
// animation at time t and calls window.r7Frame(t) for the state switches
// CSS cannot express.
(() => {
  const qs = new URLSearchParams(location.search);
  const opt = qs.get("opt") ?? "win-a";
  const root = document.documentElement;
  root.classList.add(`r7-${opt}`);
  if (opt.startsWith("win-c")) root.classList.add("r7-win-c");
  if (opt.startsWith("lose-d") || opt === "lose-e") root.classList.add("r7-lose-d");
  if (opt.startsWith("lose-f")) root.classList.add("r7-lose-f");
  if (opt === "lose-f4" || opt === "lose-f5") root.classList.add("r7-storm");
  if (opt.startsWith("draw-g")) root.classList.add("r7-draw-g");
  const LONG_DRAW = ["draw-g3", "draw-g2l", "draw-g4l", "draw-t1", "draw-t2", "draw-t3", "draw-t4", "draw-t5"];
  if (opt.startsWith("draw-t")) root.classList.add("r7-tug");
  if (LONG_DRAW.includes(opt)) root.classList.add("r7-draw-long");
  const board = document.querySelector(".board");
  const COLOURS = ["var(--mint)", "var(--pink)", "var(--sun)", "var(--white)"];

  // ---------- shared win-line helpers ----------
  function orderWinCells() {
    const cells = [...document.querySelectorAll(".cell.is-win")];
    cells.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x
      || b.getBoundingClientRect().y - a.getBoundingClientRect().y);
    cells.forEach((cell, i) => cell.style.setProperty("--i", i));
    return cells;
  }

  function lineGeometry() {
    const line = document.querySelector(".win-line line");
    if (!line) return null;
    const x1 = +line.getAttribute("x1");
    const y1 = +line.getAttribute("y1");
    const x2 = +line.getAttribute("x2");
    const y2 = +line.getAttribute("y2");
    const len = Math.hypot(x2 - x1, y2 - y1).toFixed(0);
    line.style.setProperty("--len", len);
    return { line, x1, y1, x2, y2, len };
  }

  function stars(points) {
    for (const [x, y] of points) {
      const s = document.createElement("span");
      s.className = "star";
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      board.append(s);
    }
  }

  function piece(i, extra = "") {
    return `<i class="confetti ${["", "round", "strip"][i % 3]} ${extra}"`;
  }

  // ---------- 03 win ----------
  if (opt.startsWith("win")) {
    orderWinCells();
    const g = lineGeometry();
    if (opt === "win-a" || opt === "win-c2") {
      if (opt === "win-a") stars([[g.x1 - 32, g.y1 + 4], [g.x2 + 8, g.y2 - 36]]);
      const bits = Array.from({ length: 70 }, (_, i) => {
        const x = (i * 37) % 100;
        const dx = ((i * 53) % 160) - 80;
        const r = ((i * 97) % 900) - 450;
        const d = 900 + ((i * 131) % 1000);
        const dur = 2300 + ((i * 71) % 700);
        return `${piece(i)} style="--x:${x}%;--dx:${dx}px;--r:${r}deg;--d:${d}ms;--dur:${dur}ms;--fall-h:${window.innerHeight + 60}px;--c:${COLOURS[i % 4]}"></i>`;
      }).join("");
      document.body.insertAdjacentHTML("beforeend", `<div class="confetti-full">${bits}</div>`);
    }
    if (opt === "win-b" || opt === "win-c4" || opt === "win-c5") {
      const under = g.line.cloneNode();
      under.classList.add("under");
      g.line.classList.add("gold");
      g.line.before(under);
      board.insertAdjacentHTML("afterbegin", '<span class="board-flash"></span>');
      const mx = (g.x1 + g.x2) / 2;
      const my = (g.y1 + g.y2) / 2;
      stars([
        [g.x1 - 44, g.y1 + 6], [g.x2 + 10, g.y2 - 50], [mx - 90, my - 70],
        [mx + 60, my + 40], [g.x1 + 30, g.y1 - 70], [g.x2 - 60, g.y2 + 40],
      ]);
      if (opt === "win-b") {
      const bits = Array.from({ length: 34 }, (_, i) => {
        const x = (i * 37) % 94;
        const dx = ((i * 53) % 120) - 60;
        const r = ((i * 97) % 720) - 360;
        const d = 1000 + ((i * 131) % 600);
        return `${piece(i)} style="--x:${x}%;--dx:${dx}px;--r:${r}deg;--d:${d}ms;--fall-h:${board.offsetHeight + 40}px;--c:${COLOURS[i % 4]}"></i>`;
      }).join("");
      board.insertAdjacentHTML("beforeend", `<span class="confetti-layer">${bits}</span>`);
      }
    }
    if (opt.startsWith("win-c")) {
      if (opt !== "win-c4" && opt !== "win-c5") stars([[g.x1 - 32, g.y1 + 4], [g.x2 + 8, g.y2 - 36]]);
      const trophy = document.querySelector(".result-card .emblem-icon")?.innerHTML ?? "";
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="sticker-scrim"></div>
         <div class="win-sticker"><span class="big-trophy">${trophy}</span><strong>你贏了！</strong><span>連成四子，共 13 手</span><small>點一下畫面可以跳過</small></div>`,
      );
      const shots = (side) =>
        Array.from({ length: 32 }, (_, i) => {
          const dir = side === "left" ? 1 : -1;
          const dx = dir * (260 + ((i * 53) % 420));
          const up = -(420 + ((i * 71) % 380));
          const r = ((i * 97) % 900) - 450;
          const d = 750 + ((i * 29) % 260);
          const dur = 1800 + ((i * 61) % 600);
          const pos = side === "left" ? "left:-10px" : "right:-10px";
          return `<i class="shot ${["", "round", "strip"][i % 3]}" style="${pos};--dx:${dx}px;--up:${up}px;--r:${r}deg;--d:${d}ms;--dur:${dur}ms;--c:${COLOURS[i % 4]}"></i>`;
        }).join("");
      if (opt !== "win-c2") {
        document.body.insertAdjacentHTML("beforeend", `<div class="cannon">${shots("left")}${shots("right")}</div>`);
      }
      if (opt === "win-c3" || opt === "win-c5") {
        document.body.insertAdjacentHTML("beforeend", '<div class="sticker-rays"></div>');
      }
      // fly the sticker into the result panel
      const card = document.querySelector(".result-card").getBoundingClientRect();
      const sticker = document.querySelector(".win-sticker");
      sticker.style.setProperty("--fly-x", `${card.x + card.width / 2 - window.innerWidth / 2}px`);
      sticker.style.setProperty("--fly-y", `${card.y + 50 - window.innerHeight / 2}px`);
    }
  }

  // ---------- 04 loss ----------
  if (opt.startsWith("lose")) {
    orderWinCells();
    lineGeometry();
    const mine = [...document.querySelectorAll(".cell")].filter((c) => c.querySelector(".token.green"));
    mine.sort((a, b) => +b.dataset.r - +a.dataset.r || +a.dataset.c - +b.dataset.c);
    mine.forEach((cell, k) => {
      cell.classList.add("is-mine");
      cell.style.setProperty("--k", k);
    });
    const flagSvg = (cls) =>
      `<svg class="${cls}" viewBox="0 0 120 150" aria-hidden="true"><line x1="18" y1="8" x2="18" y2="146" stroke="#1b1b1f" stroke-width="7" stroke-linecap="round"/><circle cx="18" cy="9" r="7" fill="#ffd23f" stroke="#1b1b1f" stroke-width="3"/><path class="cloth" d="M21 18 C45 8 70 30 108 18 L108 76 C72 88 46 66 21 76 Z" fill="#fff" stroke="#1b1b1f" stroke-width="5" stroke-linejoin="round"/></svg>`;
    if (opt === "lose-d1") {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="sticker-scrim lose"></div>
         <div class="win-sticker lose-sticker">${flagSvg("big-flag")}<strong>這局輸了</strong><span>Super AI 拿下這局</span><small>點一下畫面可以跳過</small></div>`,
      );
      const card = document.querySelector(".result-card").getBoundingClientRect();
      const sticker = document.querySelector(".lose-sticker");
      sticker.style.setProperty("--fly-x", `${card.x + card.width / 2 - window.innerWidth / 2}px`);
      sticker.style.setProperty("--fly-y", `${card.y + 50 - window.innerHeight / 2}px`);
    }
    if (opt === "lose-d2" || opt === "lose-e") {
      const unit = document.querySelector(".board-unit");
      unit.style.position = "relative";
      unit.insertAdjacentHTML("afterbegin", `<div class="rising-flag">${flagSvg("rise-flag")}</div>`);
    }
  }

  // ---------- round 10: centre stickers for losing and drawing ----------
  const INK = "#1b1b1f";
  const SVG = {
    cry: `<svg class="face cry" viewBox="0 0 140 140" aria-hidden="true">
      <circle cx="70" cy="72" r="58" fill="#ffd23f" stroke="${INK}" stroke-width="6"/>
      <path d="M34 42 L56 50 M106 42 L84 50" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <path d="M38 64 Q48 54 58 64 M82 64 Q92 54 102 64" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <path class="mouth" d="M50 106 Q70 84 90 106" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <g class="tears"><path class="tear t1" d="M47 70 q-8 14 0 20 q8 -6 0 -20z" fill="#a8dcff" stroke="${INK}" stroke-width="3.5"/>
      <path class="tear t2" d="M93 70 q-8 14 0 20 q8 -6 0 -20z" fill="#a8dcff" stroke="${INK}" stroke-width="3.5"/>
      <path class="tear t3" d="M47 70 q-8 14 0 20 q8 -6 0 -20z" fill="#a8dcff" stroke="${INK}" stroke-width="3.5"/>
      <path class="tear t4" d="M93 70 q-8 14 0 20 q8 -6 0 -20z" fill="#a8dcff" stroke="${INK}" stroke-width="3.5"/></g>
    </svg>`,
    cloud: `<svg class="face cloud" viewBox="0 0 160 150" aria-hidden="true">
      <g class="drops"><path class="drop d1" d="M44 104 q-6 11 0 15 q6 -4 0 -15z"/><path class="drop d2" d="M72 108 q-6 11 0 15 q6 -4 0 -15z"/>
      <path class="drop d3" d="M100 104 q-6 11 0 15 q6 -4 0 -15z"/><path class="drop d4" d="M124 108 q-6 11 0 15 q6 -4 0 -15z"/></g>
      <path class="puff" d="M34 96 a24 24 0 0 1 4 -46 a34 34 0 0 1 62 -10 a26 26 0 0 1 30 56 z" fill="#fff" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="68" cy="68" r="5" fill="${INK}"/><circle cx="98" cy="68" r="5" fill="${INK}"/>
      <path d="M70 88 Q83 78 96 88" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
    </svg>`,
    cheer: `<svg class="face cheer" viewBox="0 0 160 150" aria-hidden="true">
      <circle cx="80" cy="76" r="58" fill="#ffd23f" stroke="${INK}" stroke-width="6"/>
      <path d="M44 48 L66 58 M116 48 L94 58" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <circle cx="60" cy="70" r="6" fill="${INK}"/><circle cx="100" cy="70" r="6" fill="${INK}"/>
      <path d="M56 96 Q80 116 104 96" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <path class="spark s1" d="M18 30 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z" fill="#fff" stroke="${INK}" stroke-width="3"/>
      <path class="spark s2" d="M140 18 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="#3ddc97" stroke="${INK}" stroke-width="3"/>
      <path class="spark s3" d="M146 104 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="#ff5fa2" stroke="${INK}" stroke-width="3"/>
    </svg>`,
    scale: `<svg class="face scale" viewBox="0 0 180 150" aria-hidden="true">
      <path d="M72 140 h36 l-8 -14 h-20 z" fill="#fff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <line x1="90" y1="128" x2="90" y2="30" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
      <g class="beam">
        <line x1="24" y1="30" x2="156" y2="30" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        <path d="M24 30 L10 78 M24 30 L38 78 M156 30 L142 78 M156 30 L170 78" stroke="${INK}" stroke-width="3"/>
        <path d="M6 78 h36 a18 10 0 0 1 -36 0z M138 78 h36 a18 10 0 0 1 -36 0z" fill="#fff" stroke="${INK}" stroke-width="4"/>
        <circle cx="24" cy="66" r="12" fill="#3ddc97" stroke="${INK}" stroke-width="4"/><circle cx="24" cy="66" r="5" fill="none" stroke="${INK}" stroke-width="2.5"/>
        <circle cx="156" cy="66" r="12" fill="#ff5fa2" stroke="${INK}" stroke-width="4"/><path d="M147 63 l18 -4 M147 70 l18 -4" stroke="${INK}" stroke-width="2.5"/>
      </g>
      <circle cx="90" cy="30" r="8" fill="#ffd23f" stroke="${INK}" stroke-width="4"/>
    </svg>`,
  };

  function sticker(cls, art, title, sub) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="sticker-scrim soft"></div>
       <div class="win-sticker soft-sticker ${cls}">${art}<strong>${title}</strong><span>${sub}</span><small>點一下畫面可以跳過</small></div>`,
    );
    const card = document.querySelector(".result-card").getBoundingClientRect();
    const el = document.querySelector(".soft-sticker");
    el.style.setProperty("--fly-x", `${card.x + card.width / 2 - window.innerWidth / 2}px`);
    el.style.setProperty("--fly-y", `${card.y + 50 - window.innerHeight / 2}px`);
  }

  if (opt === "lose-f1") sticker("cry-sticker", SVG.cry, "這局輸了", "Super AI 拿下這局");
  if (opt === "lose-f2" || opt === "lose-f4" || opt === "lose-f5") {
    sticker("cloud-sticker", SVG.cloud, "這局輸了", "Super AI 拿下這局");
  }
  if (opt === "lose-f4" || opt === "lose-f5") {
    const rain = Array.from({ length: 90 }, (_, i) => {
      const x = (i * 37) % 100;
      const d = 900 + ((i * 53) % 700);
      const dur = 520 + ((i * 29) % 260);
      return `<i class="streak" style="left:${x}%;--d:${d}ms;--dur:${dur}ms"></i>`;
    }).join("");
    const bolt = (cls) =>
      `<svg class="bolt ${cls}" viewBox="0 0 60 120" aria-hidden="true"><path d="M34 2 L8 64 H28 L18 118 L54 46 H32 L44 2 Z" fill="#ffd23f" stroke="#1b1b1f" stroke-width="4" stroke-linejoin="round"/></svg>`;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="storm"><div class="storm-dim"></div>${rain}<div class="storm-flash"></div>${bolt("b1")}${bolt("b2")}</div>`,
    );
    if (opt === "lose-f5") {
      // the second bolt strikes the board
      const b = board.getBoundingClientRect();
      const b2 = document.querySelector(".bolt.b2");
      b2.style.left = `${b.x + b.width * 0.42}px`;
      b2.style.top = `${b.y - 150}px`;
      b2.classList.add("strike");
    }
  }
  if (opt === "lose-f3") sticker("cheer-sticker", SVG.cheer, "再接再厲！", "Super AI 拿下這局，下一局換你！");
  if (LONG_DRAW.includes(opt)) {
    // every piece on the full board hops once, row by row from the bottom
    document.querySelectorAll(".board .cell").forEach((cell) => {
      cell.querySelector(".token")?.style.setProperty("--row", 5 - Number(cell.dataset.r));
    });
    const two = ["var(--mint)", "var(--pink)"];
    const bits = Array.from({ length: 60 }, (_, i) => {
      const x = (i * 37) % 100;
      const dx = ((i * 53) % 120) - 60;
      const r = ((i * 97) % 720) - 360;
      const d = 1800 + ((i * 131) % 1100);
      const dur = 2300 + ((i * 71) % 600);
      return `<i class="confetti ${["", "round", "strip"][i % 3]}" style="--x:${x}%;--dx:${dx}px;--r:${r}deg;--d:${d}ms;--dur:${dur}ms;--fall-h:${window.innerHeight + 60}px;--c:${two[i % 2]}"></i>`;
    }).join("");
    document.body.insertAdjacentHTML("beforeend", `<div class="confetti-full draw-rain">${bits}</div>`);
  }
  if (opt === "draw-g1" || opt === "draw-g3") {
    sticker(
      "bump-sticker",
      `<span class="bump"><i class="token green bump-l"></i><span class="bump-star"></span><i class="token pink bump-r"></i></span>`,
      "平手！",
      "42 格全滿，勢均力敵",
    );
  }
  if (opt === "draw-g2" || opt === "draw-g2l") sticker("scale-sticker", SVG.scale, "平手！", "42 格全滿，勢均力敵");
  // round 14: tug-of-war variants. The rope carries a bow at its centre and the
  // ground has a yellow centre line; the bow ends on the line (nobody won).
  function tugSvg({ faces = false, hands = false, snap = false, cls = "" } = {}) {
    const face = (cx) =>
      faces
        ? `<path d="M${cx - 16} ${70} l8 5 -8 5 M${cx + 16} ${70} l-8 5 8 5" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
           <path d="M${cx - 12} 94 h24" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
           <path d="M${cx - 10} 91 v6 M${cx - 4} 91 v6 M${cx + 2} 91 v6 M${cx + 8} 91 v6" stroke="${INK}" stroke-width="2"/>
           <path class="sweat" d="M${cx + 26} 56 q-6 10 0 14 q6 -4 0 -14z" fill="#a8dcff" stroke="${INK}" stroke-width="2.5"/>`
        : "";
    const pattern = (cx, colour) =>
      faces
        ? ""
        : colour === "green"
          ? `<circle cx="${cx}" cy="82" r="13" fill="none" stroke="${INK}" stroke-width="5"/>`
          : `<path d="M${cx - 20} 77 l40 -10 M${cx - 20} 95 l40 -10" stroke="${INK}" stroke-width="5"/>`;
    const hand = (x1, x2) =>
      hands ? `<path d="M${x1} 84 L${x2} 80" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="${x2}" cy="80" r="6" fill="#fff" stroke="${INK}" stroke-width="3.5"/>` : "";
    const rope = snap
      ? `<g class="rope-l"><line x1="84" y1="80" x2="150" y2="80" stroke="#c98b2e" stroke-width="9" stroke-linecap="round"/><line x1="84" y1="80" x2="150" y2="80" stroke="${INK}" stroke-width="2" stroke-dasharray="3 7"/></g>
         <g class="rope-r"><line x1="150" y1="80" x2="216" y2="80" stroke="#c98b2e" stroke-width="9" stroke-linecap="round"/><line x1="150" y1="80" x2="216" y2="80" stroke="${INK}" stroke-width="2" stroke-dasharray="3 7"/></g>
         <path class="snap-star" d="M150 50 l7 20 20 7 -20 7 -7 20 -7 -20 -20 -7 20 -7z" fill="#ffd23f" stroke="${INK}" stroke-width="3.5"/>`
      : `<line x1="84" y1="80" x2="216" y2="80" stroke="#c98b2e" stroke-width="9" stroke-linecap="round"/>
         <line x1="84" y1="80" x2="216" y2="80" stroke="${INK}" stroke-width="2" stroke-dasharray="3 7"/>`;
    const bow = snap
      ? ""
      : `<g class="bow"><path d="M150 80 L134 68 L134 92 Z M150 80 L166 68 L166 92 Z" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
         <path d="M147 84 L140 104 M153 84 L160 104" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
         <circle cx="150" cy="80" r="6" fill="#ff5fa2" stroke="${INK}" stroke-width="3"/></g>`;
    return `<svg class="face tug2 ${cls}" viewBox="0 0 300 150" aria-hidden="true">
      <line x1="8" y1="134" x2="292" y2="134" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <rect class="mid" x="145" y="110" width="10" height="30" rx="2" fill="#ffd23f" stroke="${INK}" stroke-width="3"/>
      <g class="pull">
        ${rope}${bow}
        <g class="lean-l"><circle cx="52" cy="84" r="32" fill="#3ddc97" stroke="${INK}" stroke-width="5"/>${pattern(52, "green")}${face(52)}${hand(76, 90)}</g>
        <g class="lean-r"><circle cx="248" cy="84" r="32" fill="#ff5fa2" stroke="${INK}" stroke-width="5"/>${pattern(248, "pink")}${face(248)}${hand(224, 210)}</g>
      </g>
    </svg>`;
  }
  if (opt === "draw-t1") sticker("tug-sticker", tugSvg(), "平手！", "拉來拉去，誰也沒贏");
  if (opt === "draw-t2") sticker("tug-sticker", tugSvg({ faces: true, hands: true }), "平手！", "拉到滿頭大汗，還是平手");
  if (opt === "draw-t4") sticker("tug-sticker", tugSvg({ hands: true, snap: true }), "平手！", "繩子都拉斷了，還是分不出輸贏");
  if (opt === "draw-t3") {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="sticker-scrim soft tug-scrim"></div><div class="tug-stage">${tugSvg({ faces: true, hands: true, cls: "big" })}</div>`,
    );
    sticker("tug-end-sticker", "", "平手！", "拉來拉去，誰也沒贏");
  }
  if (opt === "draw-t5") {
    // T3 + T4: the big full-screen tug, and the rope snaps
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="sticker-scrim soft tug-scrim"></div><div class="tug-stage">${tugSvg({ faces: true, hands: true, snap: true, cls: "big" })}</div>`,
    );
    sticker("tug-end-sticker", "", "平手！", "繩子都拉斷了，還是分不出輸贏");
  }
  if (opt === "draw-g4l") {
    const tug = `<svg class="face tug" viewBox="0 0 240 130" aria-hidden="true">
      <line x1="10" y1="114" x2="230" y2="114" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
      <line x1="120" y1="96" x2="120" y2="124" stroke="${INK}" stroke-width="4" stroke-dasharray="5 4"/>
      <g class="pull">
        <line x1="44" y1="66" x2="196" y2="66" stroke="#c98b2e" stroke-width="7" stroke-linecap="round"/>
        <line x1="44" y1="66" x2="196" y2="66" stroke="${INK}" stroke-width="2" stroke-dasharray="3 6"/>
        <path d="M120 66 L108 92 L132 92 Z" fill="#ffd23f" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <g class="lean-l"><circle cx="40" cy="70" r="26" fill="#3ddc97" stroke="${INK}" stroke-width="5"/><circle cx="40" cy="70" r="11" fill="none" stroke="${INK}" stroke-width="4"/></g>
        <g class="lean-r"><circle cx="200" cy="70" r="26" fill="#ff5fa2" stroke="${INK}" stroke-width="5"/><path d="M184 66 l32 -8 M184 80 l32 -8" stroke="${INK}" stroke-width="4"/></g>
      </g>
    </svg>`;
    sticker("tug-sticker", tug, "平手！", "拉來拉去，誰也沒贏");
  }

  // ---------- 02 AI thinking ----------
  if (opt.startsWith("think")) {
    const CLICK = 300;
    const WAIT = Number(qs.get("wait") ?? 500);
    const AI_AT = CLICK + WAIT; // the AI never answers sooner than WAIT ms
    const showLabelAt = opt === "think-a" ? CLICK + 300 : CLICK;
    const head = document.querySelector(".board-head.in-unit");
    const yourTurn = head.innerHTML;
    const chip = (n) => yourTurn.replace(/第 \d+ 手/, `第 ${n} 手`);
    const thinking = yourTurn
      .replace(/<i class="token green status-token"[^>]*><\/i>/, '<i class="token pink status-token" aria-hidden="true"></i>')
      .replace("輪到你了", "AI 正在思考")
      .replace(/<span class="hint">[^<]*<\/span>/, '<span class="dots thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>')
      .replace(/第 \d+ 手/, "第 8 手");
    const hand = document.querySelector(".hand");
    const ghostCell = document.querySelector(".cell.is-preview");
    const ghost = ghostCell.querySelector(".token.ghost");
    const colHover = document.querySelector(".col-hover");
    const handTop = hand.querySelector(".token").getBoundingClientRect().top;
    const bw = parseFloat(getComputedStyle(ghostCell).borderTopWidth);
    const fall = ghostCell.getBoundingClientRect().top - bw - handTop;
    const drop = (cell, colour, at) => {
      cell.insertAdjacentHTML(
        "beforeend",
        `<i class="token ${colour} is-dropping r7-drop" style="--fall:${fall}px;--drop-dur:350ms;animation-delay:${at}ms"></i>`,
      );
      return cell.lastElementChild;
    };
    const mineDrop = drop(ghostCell, "green", CLICK);
    const aiCell = document.querySelector('.cell[data-r="3"][data-c="3"]');
    const aiDrop = drop(aiCell, "pink", AI_AT);
    const pct = (ms) => `${(ms / (WAIT + 800)) * 100}%`;
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="r7-clock"><span class="time">點擊後 0.00 秒</span><span class="track">
        <span class="seg" style="left:0;width:${pct(WAIT)}"></span>
        <span class="seg label" style="left:${pct(showLabelAt - CLICK)};width:${pct(AI_AT - showLabelAt)}"></span>
        <span class="head" style="left:0"></span></span></div>`,
    );
    const time = document.querySelector(".r7-clock .time");
    const playhead = document.querySelector(".r7-clock .head");
    let last = "";
    window.r7Frame = (t) => {
      const before = t < CLICK;
      hand.classList.toggle("r7-hidden", before === false && t < AI_AT + 350);
      ghost.classList.toggle("r7-hidden", !before);
      colHover?.classList.toggle("r7-hidden", !before);
      mineDrop.classList.toggle("r7-hidden", before);
      aiDrop.classList.toggle("r7-hidden", t < AI_AT);
      let html;
      if (before) html = yourTurn;
      else if (t >= AI_AT) html = chip(9);
      else if (t >= showLabelAt) html = thinking;
      else html = "";
      if (html !== last) {
        const mineTurn = html === yourTurn || t >= AI_AT;
        document.querySelectorAll(".match-card .turn-tag").forEach((el) => el.classList.toggle("r7-hidden", !mineTurn));
        document.querySelectorAll(".match-card .player.is-me").forEach((el) => el.classList.toggle("is-current", mineTurn));
        head.className = `board-head in-unit ${html === thinking ? "thinking" : "mine"}`;
        head.innerHTML = html;
        last = html;
        for (const a of head.getAnimations({ subtree: true })) {
          a.pause();
          a.currentTime = t;
        }
      }
      const since = Math.max(0, t - CLICK);
      time.textContent = `點擊後 ${(since / 1000).toFixed(2)} 秒`;
      playhead.style.left = `min(100%, ${pct(since)})`;
    };
    window.r7Frame(0);
  }

  document.body.dataset.ready = "1";
})();
