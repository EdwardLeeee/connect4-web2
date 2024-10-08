# 使用 Flask 和 Flask-SocketIO
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from game_logic import check_winner

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

players = []
turn = 'red'

board = [['' for _ in range(7)] for _ in range(6)]

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print('A user connected')
    players.append(request.sid)

    if len(players) == 2:
        socketio.emit('startGame', {'player': 'red'}, room=players[0])
        socketio.emit('startGame', {'player': 'yellow'}, room=players[1])

@socketio.on('makeMove')
def handle_make_move(data):
    global turn, board
    col = int(data['col'])
    player = data['player']

    if player != turn:
        return

    for row in range(5, -1, -1):
        if board[row][col] == '':
            board[row][col] = player
            emit('moveMade', {'col': col, 'row': row, 'player': player}, broadcast=True)
            if check_winner(board, player):
                emit('highlightWinningCells', {'player': player}, broadcast=True)
                emit('gameOver', {'winner': player}, broadcast=True)
            turn = 'yellow' if turn == 'red' else 'red'
            break

@socketio.on('disconnect')
def handle_disconnect():
    print('A user disconnected')
    if request.sid in players:
        players.remove(request.sid)

if __name__ == '__main__':
    socketio.run(app, port=5555, host='0.0.0.0',debug=True)
