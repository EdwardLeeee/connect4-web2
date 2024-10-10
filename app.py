# 使用 Flask 和 Flask-SocketIO
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import random
import game_logic

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

players = {}
turn = {}
board = {}

@app.route('/')
def index():
    return render_template('home.html')

@app.route('/create_room')
def create_room():
    room_id = str(random.randint(1000, 9999))
    players[room_id] = []
    turn[room_id] = 'player1'
    board[room_id] = [['' for _ in range(7)] for _ in range(6)]
    return redirect(url_for('room', room_id=room_id))

@app.route('/room/<room_id>')
def room(room_id):
    if room_id in players:
        return render_template('index.html', room_id=room_id)
    else:
        return "Room not found", 404

@socketio.on('join')
def on_join(data):
    room_id = data['room']
    sid = request.sid
    if room_id in players:
        join_room(room_id)
        players[room_id].append(sid)
        if len(players[room_id]) == 2:
            socketio.emit('startGame', {'player': 'player1'}, room=players[room_id][0])
            socketio.emit('startGame', {'player': 'player2'}, room=players[room_id][1])
    else:
        emit('roomNotFound')

@socketio.on('makeMove')
def handle_make_move(data):
    room_id = data['room']
    col = int(data['col'])
    player = data['player']

    if player != turn[room_id]:
        return

    for row in range(5, -1, -1):
        if board[room_id][row][col] == '':
            board[room_id][row][col] = player
            emit('moveMade', {'col': col, 'row': row, 'player': player}, room=room_id)

            # 檢查贏家
            if game_logic.check_winner(board[room_id], player):
                winning_cells = game_logic.get_winning_cells(board[room_id], player)  # 回傳贏家棋子的座標
                emit('highlightWinningCells', {'winningCells': winning_cells}, room=room_id)
                emit('gameOver', {'winner': player}, room=room_id)
                return
            # 使用 game_logic 檢查平局
            elif game_logic.check_draw(board[room_id]):
                emit('gameOver', {'winner': None}, room=room_id)  # 廣播平局事件
                return
            else:
                turn[room_id] = 'player2' if turn[room_id] == 'player1' else 'player1'
                break

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for room_id, sids in players.items():
        if sid in sids:
            sids.remove(sid)
            leave_room(room_id)
            break

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=55555, debug=True)
