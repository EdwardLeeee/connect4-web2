const socket = io();
let playerColor;
let myTurn = false;

// Emit 'join' event to the server with the room ID
socket.emit('join', { room: roomId });

socket.on('startGame', (data) => {
  playerColor = data.player;
  alert(`You are ${playerColor}`);
  myTurn = (playerColor === 'player1');
  updateTurnIndicator();
});

const gameBoard = document.getElementById('gameBoard');
const columns = 7;
const rows = 6;

// Initialize game board
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
  socket.emit('makeMove', { col, player: playerColor, room: roomId });
}

socket.on('moveMade', (data) => {
  // Update the game board on the frontend
  const cell = document.querySelector(`[data-row='${data.row}'][data-col='${data.col}']`);
  
  cell.classList.add(data.player);
  
  myTurn = (data.player !== playerColor);
  updateTurnIndicator();
});

socket.on('highlightWinningCells', (data) => {
  // Highlight the winning cells
  const winningCells = data.winningCells;
  winningCells.forEach((cell) => {
    const { row, col } = cell;
    const winningCell = document.querySelector(`[data-row='${row}'][data-col='${col}']`);
    winningCell.classList.add('winning-cell');
  });
});

socket.on('gameOver', (data) => {
  // 创建自定义的对话框
  const gameOverDialog = document.createElement('div');
  gameOverDialog.classList.add('dialog');
  gameOverDialog.innerHTML = `
    <div class="dialog-content">
      <p>${data.winner ? (playerColor === data.winner ? 'You win!!!' : 'You lose!!!') : 'It\'s a draw!!!'}</p>
      <button id="closeDialogButton">OK</button>
    </div>
  `;
  document.body.appendChild(gameOverDialog);

  // 添加按钮点击事件
  const closeDialogButton = gameOverDialog.querySelector('#closeDialogButton');
  closeDialogButton.onclick = () => {
    document.body.removeChild(gameOverDialog);
    if (confirm('Return to the main menu?')) {
      window.location.href = '/'; // Return to home
    }
  };

  myTurn = false;
});


function updateTurnIndicator() {
  const turnText = document.getElementById('turnText');
  const opponentColor = playerColor === 'player1' ? 'player2' : 'player1';
  if (myTurn) {
    turnText.innerHTML = `${playerColor} , it's your turn!`;
    turnText.innerHTML += ` <span class='cell ${playerColor}' style='width: 20px; height: 20px;'></span>`;
  } else {
    turnText.innerHTML = "Waiting for opponent's turn...";
    turnText.innerHTML += ` <span class='cell ${opponentColor}' style='width: 20px; height: 20px;'></span>`;
  }
}
