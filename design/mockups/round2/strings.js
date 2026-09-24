// Every UI string the round-2 artboards use, in both languages. Keys marked
// NEW do not exist in frontend/src/i18n.ts yet; design/spec.md lists them.
window.STRINGS = {
  "zh-TW": {
    brand: "CONNECT 4",
    leave: "離開",
    restart: "重新開始",
    rematch: "再來一局",
    backToLobby: "回到大廳", // NEW
    copyCode: "複製房號", // NEW (was common.copy)
    copied: "已複製",
    shareInvite: "分享邀請", // NEW
    copyLink: "複製邀請連結", // NEW
    cancel: "取消",
    save: "儲存",
    connecting: "連線中…",
    offline: "連線中斷，正在重試…",

    aiTitle: "挑戰 AI",
    aiBody: "每一步都算到終局。你能找出擊敗 AI 的那一手嗎？",
    aiAction: "立即對戰",
    friendTitle: "和朋友一起玩",
    friendBody: "分享一組房號，立刻和朋友來場鬥智對決。",
    createRoom: "建立私人房",
    joinRoom: "加入房間",
    roomCode: "房間代碼",
    matchTitle: "隨機配對",
    matchBody: "立即配對線上玩家，看看誰能先連成四子。",
    matchAction: "開始配對",
    lobbyOffline: "連線恢復前無法開始對局。", // NEW
    inviteBanner: "朋友邀請你加入房間", // NEW
    inviteHint: "房號已帶入，按「加入房間」就能開始。", // NEW

    profileTitle: "玩家設定",
    nickname: "暱稱",
    language: "語言",
    chinese: "繁體中文",
    english: "English",

    yourTurn: "輪到你了",
    yourTurnHint: "選一欄落子", // NEW
    opponentTurn: "{name} 正在思考", // NEW (was game.opponentTurn)
    moveNo: "第 {n} 手", // NEW
    gameOver: "對局結束", // NEW
    first: "先手", // NEW
    second: "後手", // NEW
    you: "你",
    lastMove: "上一手", // NEW — game.history
    columnN: "第 {n} 欄",
    solver: "精確求解器", // NEW
    online: "在線", // NEW
    offlineTag: "離線", // NEW
    kbdPick: "選欄", // NEW
    kbdDrop: "落子", // NEW
    versus: "對",
    series: "本場比分", // NEW — game.series
    modeAi: "挑戰 Super AI", // NEW
    modePrivate: "私人房", // NEW
    modeMatch: "隨機配對",

    aiThinking: "AI 正在思考", // changed
    paused: "{name} 離線了", // NEW (replaces game.paused)
    pausedBody: "保留棋局 30 秒，等對方回來。", // NEW
    reconnected: "{name} 回來了", // NEW

    win: "你贏了！",
    winSub: "連成四子，共 {n} 手", // NEW
    loseAi: "Super AI 拿下這局", // NEW
    loseAiSub: "挑戰者別氣餒，再挑戰一次？", // NEW
    lose: "{name} 拿下這局", // NEW
    draw: "平手！",
    drawSub: "42 格全滿，沒有人連成四子。", // NEW
    forfeitWin: "你獲勝！{name} 離線逾時", // NEW (was game.forfeitWin)
    forfeitWinSub: "對手沒有在 30 秒內回來。", // NEW
    forfeitLose: "離線逾時，這局判負", // NEW
    forfeitLoseSub: "你的連線中斷超過 30 秒，由對手獲勝。", // NEW
    left: "{name} 離開了房間", // NEW
    leftSub: "這局算你獲勝。對手已離開，無法再來一局。", // NEW
    solverError: "AI 求解器暫時無法使用",
    solverErrorBody: "本局已停止；系統不會改用較弱的備援 AI。",
    rematchSent: "已邀請 {name} 再來一局", // NEW (was game.rematchWaiting)
    rematchPending: "{name} 還沒回應", // NEW — game.rematch[opponent] false
    rematchWaitingBtn: "等待對手回應…", // NEW
    rematchIncoming: "{name} 想再來一局！", // NEW — game.rematch[opponent]
    rematchIncomingSub: "按下就開始下一局，雙方顏色不變。", // NEW
    rematchAccept: "好，再來一局", // NEW
    leftAfter: "{name} 已離開房間，無法再來一局。", // NEW — rematch_available false
    gameOffline: "連線中斷，正在重新連線…", // NEW
    gameOfflineBody: "恢復前棋盤暫停操作，棋局會保留。", // NEW
    otherTab: "已在其他分頁開啟", // NEW
    otherTabBody:
      "這局正在另一個分頁進行。一次只能有一個分頁連線；在這裡繼續，另一個分頁就會中斷。", // NEW
    continueHere: "在這裡繼續", // NEW

    waiting: "等待中",
    searching: "正在尋找對手",
    searchingBody: "保持此頁開啟，配對成功會自動開始。",
    waitedFor: "已等待 {t}", // NEW
    cancelSearch: "取消配對",
    waitingFriend: "等待朋友加入",
    waitingFriendBody: "分享邀請或房號，朋友加入後立即開局。", // changed
    scanToJoin: "用手機掃描加入", // NEW

    errRoomNotFound: "找不到這個房間。",
    errNickname: "暱稱需為 1–18 個字。", // NEW (invalid_nickname)
    close: "關閉",
  },
  en: {
    brand: "CONNECT 4",
    leave: "Leave",
    restart: "Restart",
    rematch: "Rematch",
    backToLobby: "Back to lobby",
    copyCode: "Copy code",
    copied: "Copied",
    shareInvite: "Share invite",
    copyLink: "Copy invite link",
    cancel: "Cancel",
    save: "Save",
    connecting: "Connecting…",
    offline: "Connection lost. Retrying…",

    aiTitle: "Challenge AI",
    aiBody: "It sees every line to the end. Can you find the move that wins?",
    aiAction: "Play now",
    friendTitle: "Play with friends",
    friendBody: "Share a room code and turn any moment into a friendly showdown.",
    createRoom: "Create private room",
    joinRoom: "Join room",
    roomCode: "Room Code",
    matchTitle: "Quick match",
    matchBody: "Jump into a live match and race to connect four first.",
    matchAction: "Find a match",
    lobbyOffline: "You can start a game once the connection is back.",
    inviteBanner: "A friend invited you to room",
    inviteHint: "The code is filled in. Tap “Join room” to start.",

    profileTitle: "Player settings",
    nickname: "Nickname",
    language: "Language",
    chinese: "繁體中文",
    english: "English",

    yourTurn: "Your turn",
    yourTurnHint: "Pick a column",
    opponentTurn: "{name} is thinking",
    moveNo: "Move {n}",
    gameOver: "Game over",
    first: "First",
    second: "Second",
    you: "You",
    lastMove: "Last move",
    columnN: "Column {n}",
    solver: "Exact solver",
    online: "Online",
    offlineTag: "Offline",
    kbdPick: "choose",
    kbdDrop: "drop",
    versus: "vs",
    series: "Series",
    modeAi: "vs Super AI",
    modePrivate: "Private room",
    modeMatch: "Quick match",

    aiThinking: "AI is thinking",
    paused: "{name} went offline",
    pausedBody: "Holding the game for 30 seconds while they reconnect.",
    reconnected: "{name} is back",

    win: "You won!",
    winSub: "Four in a row in {n} moves",
    loseAi: "Super AI takes this one",
    loseAiSub: "Don’t give up, challenger. Try again?",
    lose: "{name} won this game",
    draw: "It’s a draw!",
    drawSub: "All 42 slots are full and nobody connected four.",
    forfeitWin: "You win! {name} timed out",
    forfeitWinSub: "Your opponent didn’t come back within 30 seconds.",
    forfeitLose: "You timed out — game lost",
    forfeitLoseSub:
      "Your connection dropped for more than 30 seconds, so your opponent wins.",
    left: "{name} left the room",
    leftSub:
      "You win this game. They’ve left, so a rematch isn’t available.",
    solverError: "The AI solver is unavailable",
    solverErrorBody:
      "This game stopped; it will never fall back to a weaker AI.",
    rematchSent: "Rematch invite sent to {name}",
    rematchPending: "Waiting for {name} to answer",
    rematchWaitingBtn: "Waiting for response…",
    rematchIncoming: "{name} wants a rematch!",
    rematchIncomingSub: "Accept to start the next game. Colours stay the same.",
    rematchAccept: "Accept rematch",
    leftAfter: "{name} has left the room, so a rematch isn’t available.",
    gameOffline: "Connection lost — reconnecting…",
    gameOfflineBody: "The board is paused until you’re back. The game is kept.",
    otherTab: "Open in another tab",
    otherTabBody:
      "This game is running in another tab. Only one tab can be connected at a time; continuing here disconnects the other tab.",
    continueHere: "Continue here",

    waiting: "Waiting",
    searching: "Finding an opponent",
    searchingBody: "Keep this page open; the match starts automatically.",
    waitedFor: "Waiting {t}",
    cancelSearch: "Cancel search",
    waitingFriend: "Waiting for your friend",
    waitingFriendBody:
      "Share the invite or the code. The game starts as soon as they join.",
    scanToJoin: "Scan to join on a phone",

    errRoomNotFound: "That room does not exist.",
    errNickname: "Nickname must be 1–18 characters.",
    close: "Close",
  },
};
