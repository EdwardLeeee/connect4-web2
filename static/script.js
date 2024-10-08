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

socket.on('highlightWinningCells', (data) => {
  // 假設 check_winner 函數回傳了贏的棋子位置
  const winningCells = data.winningCells;
  winningCells.forEach((cell) => {
    const { row, col } = cell;
    const winningCell = document.querySelector(`[data-row='${row}'][data-col='${col}']`);
    winningCell.classList.add('winning-cell');
  });
});

socket.on('gameOver', (data) => {
  // 遊戲結束提示
  setTimeout(() => {
    alert(`${data.winner} wins!`);
    myTurn = false;
  }, 100);
});
