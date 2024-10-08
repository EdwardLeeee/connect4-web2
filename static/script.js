const socket = io();
let playerColor;
let myTurn = false;

socket.on('startGame', (data) => {
  playerColor = data.player;
  alert(`You are playing as ${playerColor}`);
  myTurn = (playerColor === 'red');
});

const gameBoard = document.getElementById('gameBoard');
const columns = 7;
const rows = 6;

// 初始化棋盤
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < columns; c++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.row = r;
    cell.dataset.col = c;
    cell.addEventListener('click', makeMove);
    gameBoard.appendChild(cell);
  }
}

function makeMove(event) {
  if (!myTurn) return;
  const col = event.target.dataset.col;
  socket.emit('makeMove', { col, player: playerColor });
}

socket.on('moveMade', (data) => {
  // 在前端更新棋盤
  const cell = document.querySelector(`[data-row='${data.row}'][data-col='${data.col}']`);
  cell.classList.add(data.player);
  myTurn = (data.player !== playerColor);
});

socket.on('gameOver', (data) => {
  alert(`${data.winner} wins!`);
  // 遊戲結束後，禁止再進行操作
  myTurn = false;
});
