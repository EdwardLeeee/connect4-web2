// Direction card: what the direction is, what it costs, and its palette.
const dir = new URLSearchParams(location.search).get("dir") ?? "a";
document.documentElement.dataset.dir = dir;
document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="theme-${dir}.css" />`);

const cards = {
  a: {
    letter: "A",
    name: "溫室桌遊",
    en: "Greenhouse Tabletop",
    badge: "★ 推薦",
    colour: "保留綠／粉紅",
    keywords: ["實體桌遊", "溫暖", "觸感", "立體"],
    swatches: [
      ["#f5f0e8", "奶油桌面"], ["#365e56", "棋盤 sage"], ["#66d3a3", "薄荷棋子"],
      ["#f38fae", "粉紅棋子"], ["#21332d", "墨綠文字"], ["#f4c95d", "勝利金"],
    ],
    font: "系統字（iPhone：PingFang TC），不加 webfont",
    fontSample: "CONNECT 4　輪到你了　第 7 手",
    motion: "重力落子＋兩次小彈跳；勝利時沿四顆棋子畫一條金線",
    cost: "品牌資產、manifest、e2e 像素測試全部不動；現有尺寸斷言可保留",
    why: [
      "成本最低，品牌與現有圖示一致",
      "「沒遊戲感」靠立體棋盤、落子軌道、動效與側欄資訊解決，不必換色",
      "色弱花紋（同心圓／斜線）與 44px 觸控數字全部保留",
    ],
  },
  b: {
    letter: "B",
    name: "午夜街機",
    en: "Midnight Arcade",
    badge: "",
    colour: "換色：黃／紅（深色單一主題）",
    keywords: ["夜間", "霓虹", "遊戲機台", "高對比"],
    swatches: [
      ["#0c1230", "夜藍背景"], ["#2749c9", "鈷藍棋盤"], ["#ffc93c", "太陽黃（先手）"],
      ["#ff5a6e", "珊瑚紅（後手）"], ["#4de3ff", "霓虹青"], ["#eef1ff", "文字"],
    ],
    font: "Chakra Petch 700（拉丁子集 2 字重約 20KB）＋系統中文字",
    fontSample: "CONNECT 4　0123456789　輪到你了",
    motion: "落子拖出光跡；勝利線霓虹掃光；輪到誰誰發光",
    cost: "全部品牌圖示、favicon、OG 圖、manifest 與 theme-color 重做；e2e 像素測試必改；36 張基準截圖重產",
    why: [
      "深色是唯一主題，不是亮暗切換，第二階段張數不加倍",
      "致敬經典紅黃四子棋，遊戲感最強",
      "與現有品牌差異最大，換色成本最高",
    ],
  },
  c: {
    letter: "C",
    name: "粗線派對",
    en: "Bold Pop",
    badge: "",
    colour: "保留綠／粉紅色相（調亮）",
    keywords: ["平面", "粗黑描邊", "硬陰影", "派對感"],
    swatches: [
      ["#fff4dc", "紙白背景"], ["#ffd23f", "向日葵棋盤"], ["#3ddc97", "薄荷棋子"],
      ["#ff5fa2", "桃紅棋子"], ["#1b1b1f", "墨黑描邊"], ["#ffffff", "卡片白"],
    ],
    font: "Space Grotesk（拉丁子集約 22KB）＋系統中文最粗字重",
    fontSample: "CONNECT 4　0123456789　輪到你了！",
    motion: "方塊感快速回彈；勝利時四顆棋子依序跳起",
    cost: "色相不變，e2e 像素測試仍過；圖示依新色值重出、manifest 色碼更新",
    why: [
      "最活潑、最有個性，截圖辨識度高",
      "粗描邊讓棋子在小螢幕上輪廓最清楚",
      "風格強烈，長時間看可能較吵",
    ],
  },
}[dir];

const token = (c, extra = "") => `<i class="token ${c} ${extra}"></i>`;

document.body.innerHTML = `
<div class="direction-card">
  <header>
    <span class="letter">${cards.letter}</span>
    <div>
      <p class="en">${cards.en}</p>
      <h1>${cards.name}</h1>
      <p class="colour">${cards.colour}</p>
    </div>
    ${cards.badge ? `<span class="badge">${cards.badge}</span>` : ""}
  </header>
  <ul class="keywords">${cards.keywords.map((k) => `<li>${k}</li>`).join("")}</ul>
  <div class="body">
    <section class="specimen">
      <div class="tokens">${token("g", "big")}${token("p", "big")}</div>
      <div class="swatches">${cards.swatches
        .map(([hex, label]) => `<div><span style="background:${hex}"></span><b>${hex}</b><small>${label}</small></div>`)
        .join("")}</div>
      <p class="font-sample">${cards.fontSample}</p>
    </section>
    <section class="notes">
      <dl>
        <dt>字體</dt><dd>${cards.font}</dd>
        <dt>動效</dt><dd>${cards.motion}</dd>
        <dt>連動成本</dt><dd>${cards.cost}</dd>
        <dt>${cards.badge ? "推薦理由" : "取捨"}</dt>
        <dd><ul>${cards.why.map((w) => `<li>${w}</li>`).join("")}</ul></dd>
      </dl>
    </section>
  </div>
  <footer>第一階段 · 方向 ${cards.letter} · 下兩張是同一個狀態（P03 對局中、輪到你）的桌機與手機</footer>
</div>`;
