import pickle

mcts_lookup_table = {}

def load_table():
    """ 讀取 MCTS 預計算表 """
    global mcts_lookup_table
    try:
        with open("mcts_table.pkl", "rb") as f:
            mcts_lookup_table = pickle.load(f)
        print(f"✅ 成功載入 MCTS 預計算表，包含 {len(mcts_lookup_table)} 局面")
        print()
        print("前五筆資料：")
        for i, (key, value) in enumerate(mcts_lookup_table.items()):
            print(f"值: {value}")
            if i >= 10:
                break
    except FileNotFoundError:
        print("⚠️ 找不到 MCTS 預計算表，AI 會即時計算")
        mcts_lookup_table = {}
       
def convert_board(board):
    """ 將棋盤從 ['', 'player1', 'ai'] 格式轉換成數字格式：空格為 0，player1 為 1，player2 為 2 """
    mapping = {"": 0, "player1": 1, "ai": 2}
    return [[mapping[cell] for cell in row] for row in board]

def board_to_key(board):
    """ 把棋盤轉換成哈希表的 key（字串形式） """
    numeric_board = convert_board(board)
    return str(numeric_board)
    #return str(board)

def get_best_move(board):
    """ 查詢最佳走法，若無則回傳 None """
    board_key = board_to_key(board)
    #return mcts_lookup_table.get(board_key, None)
    move = mcts_lookup_table.get(board_key, None)
    if move is not None:
        print(f"[MCTS Table] 成功命中查表：盤面 {board_key} 的最佳走法為 {move}")
    else:
        print(f"[MCTS Table] 查表未命中：盤面 {board_key} 沒有預計算資料")
    return move
