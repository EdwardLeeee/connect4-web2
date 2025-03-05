# 使用 Flask 和 Flask-SocketIO
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import random
import game_logic
import ai
import mcts_table  # 匯入 MCTS 查表系統

ai_mode = {}

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

players = {}
turn = {}
board = {}

# 預先載入 MCTS 查表資料
mcts_table.load_table()

@app.route('/create_ai_room')
def create_ai_room():
    room_id = str(random.randint(1000, 9999))
    players[room_id] = []
    turn[room_id] = 'player1'
    board[room_id] = [['' for _ in range(7)] for _ in range(6)]
    ai_mode[room_id] = True
    return redirect(url_for('room', room_id=room_id))

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
        if room_id in ai_mode and ai_mode[room_id]:
            players[room_id].append(sid)
            emit('startGame', {'player': 'player1', 'mode': 'ai'})
        else:
            players[room_id].append(sid)
            if len(players[room_id]) == 2:
                socketio.emit('startGame', {'player': 'player1', 'mode': 'pvp'}, room=players[room_id][0])
                socketio.emit('startGame', {'player': 'player2', 'mode': 'pvp'}, room=players[room_id][1])
    else:
        emit('roomNotFound')

@socketio.on('makeMove')
def handle_make_move(data):
    room_id = data['room']
    col = int(data['col'])
    player = data['player']

    if player != turn[room_id]:
        return

    # 玩家落子
    for row in range(5, -1, -1):
        if board[room_id][row][col] == '':
            board[room_id][row][col] = player
            emit('moveMade', {'col': col, 'row': row, 'player': player}, room=room_id)
            break

    # 檢查玩家是否勝利
    if game_logic.check_winner(board[room_id], player):
        winning_cells = game_logic.get_winning_cells(board[room_id], player)
        emit('highlightWinningCells', {'winningCells': winning_cells}, room=room_id)
        emit('gameOver', {'winner': player}, room=room_id)
        return
    elif game_logic.check_draw(board[room_id]):
        emit('gameOver', {'winner': None}, room=room_id)
        return
    else:
        if room_id in ai_mode and ai_mode[room_id]:
            # AI 落子（優先查 MCTS 查表）
            turn[room_id] = 'player1'  # 玩家始終為 player1
            ai_col = mcts_table.get_best_move(board[room_id])  # 優先查表

            # 如果查表沒找到，才用 MCTS 即時計算
            if ai_col is None:
                # print('沒有表')
                ai_col = ai.get_ai_move(board[room_id], depth=6)

            # 落子並傳送結果
            for row in range(5, -1, -1):
                if board[room_id][row][ai_col] == '':
                    board[room_id][row][ai_col] = 'ai'
                    emit('moveMade', {'col': ai_col, 'row': row, 'player': 'ai'}, room=room_id)
                    break

            if game_logic.check_winner(board[room_id], 'ai'):
                winning_cells = game_logic.get_winning_cells(board[room_id], 'ai')
                emit('highlightWinningCells', {'winningCells': winning_cells}, room=room_id)
                emit('gameOver', {'winner': 'ai'}, room=room_id)
                return
            elif game_logic.check_draw(board[room_id]):
                emit('gameOver', {'winner': None}, room=room_id)
                return
        else:
            turn[room_id] = 'player2' if turn[room_id] == 'player1' else 'player1'

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    for room_id, sids in players.items():
        if sid in sids:
            sids.remove(sid)
            leave_room(room_id)
            break

if __name__ == '__main__':
    # 啟動 Flask 伺服器時，先讀取 MCTS 查表
    mcts_table.load_table()

    # debug 必須 false，不然不能背景執行
    socketio.run(app, host='127.0.0.1', port=55555, debug=False)

