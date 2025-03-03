import pickle

mcts_lookup_table = {}

def load_table():
    """ 讀取 MCTS 預計算表 """
    global mcts_lookup_table
    try:
        with open("mcts_table.pkl", "rb") as f:
            mcts_lookup_table = pickle.load(f)
        print(f"✅ 成功載入 MCTS 預計算表，包含 {len(mcts_lookup_table)} 局面")
    except FileNotFoundError:
        print("⚠️ 找不到 MCTS 預計算表，AI 會即時計算")
        mcts_lookup_table = {}

def board_to_key(board):
    """ 把棋盤轉換成哈希表的 key（字串形式） """
    return str(board)

def get_best_move(board):
    """ 查詢最佳走法，若無則回傳 None """
    board_key = board_to_key(board)
    return mcts_lookup_table.get(board_key, None)

