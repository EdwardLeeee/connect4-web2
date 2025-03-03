# mcts_table_build.pyx
import pickle
import numpy as np
cimport numpy as cnp
import random
import time
from collections import defaultdict
from libc.stdlib cimport rand
from multiprocessing import Pool, cpu_count  # 多進程部分我們在外層用 Python Manager 呼叫

# 設置 NumPy C 擴展
cnp.import_array()

# 棋盤設定
cdef int ROW_COUNT = 6
cdef int COLUMN_COUNT = 7
cdef int EMPTY = 0
cdef int PLAYER = 1
cdef int AI = 2

# (原本全域 mcts_table 已不再使用，改用 Manager 共享字典)
# cdef dict mcts_table = defaultdict(dict)

cdef cnp.ndarray create_board():
    """ 建立空棋盤 """
    return np.zeros((ROW_COUNT, COLUMN_COUNT), dtype=np.int32)

cdef bint is_valid_location(cnp.ndarray board, int col):
    """ 檢查這一列是否可以落子 """
    return board[ROW_COUNT - 1, col] == EMPTY

cdef int get_next_open_row(cnp.ndarray board, int col):
    """ 找到這一列最底下的可落子位置 """
    cdef int r
    for r in range(ROW_COUNT):
        if board[r, col] == EMPTY:
            return r
    return -1  # 如果該列已滿，返回 -1

cdef void drop_piece(cnp.ndarray board, int row, int col, int piece):
    """ 落下一顆棋子 """
    board[row, col] = piece

cdef str board_to_key(cnp.ndarray board):
    """ 把棋盤轉換成哈希表的 key（字串形式） """
    return str(board.tolist())

# 修改 store_mcts_result 接收共享字典 shared_table
cdef void store_mcts_result(cnp.ndarray board, int best_move, object shared_table):
    cdef str key = board_to_key(board)
    # 將結果存入共享字典
    shared_table[key] = {"move": best_move, "board": board.tolist()}
    
def save_table(shared_table):
    """ 儲存 MCTS 結果到檔案，將 Manager 共享字典轉換成普通字典 """
    normal_table = dict(shared_table)  # 轉換成普通字典
    with open("mcts_table.pkl", "wb") as f:
        pickle.dump(normal_table, f)
    print(f"✅ MCTS 查表儲存成功，共計 {len(normal_table)} 局面")


cdef int run_mcts(cnp.ndarray board, int iterations=500):
    """ Monte Carlo Tree Search (MCTS) 計算最佳落子 """
    cdef list valid_moves = [c for c in range(COLUMN_COUNT) if is_valid_location(board, c)]
    cdef dict scores = {c: 0 for c in valid_moves}
    cdef int move

    for _ in range(iterations):
        move = random.choice(valid_moves)
        scores[move] += random_simulation(board, move)

    return max(scores, key=scores.get)

cdef int random_simulation(cnp.ndarray board, int move):
    """ 隨機模擬對局，回傳勝負結果 """
    cdef cnp.ndarray temp_board = board.copy()
    cdef int row = get_next_open_row(temp_board, move)
    if row == -1:
        return 0  # 這一步不能下，返回 0 分
    drop_piece(temp_board, row, move, AI)
    return 1 if rand() % 2 == 0 else -1  # 隨機勝負（簡單模擬）

# 修改 precompute_mcts_task 接收共享字典
def precompute_mcts_task(int sub_depth, object shared_table):
    """ MCTS 預計算的子任務，讓多核心一起運算 """
    cdef int move, row
    cdef cnp.ndarray board
    # 可加入除錯輸出以檢查進度
    for i in range(sub_depth):
        board = create_board()
        for j in range(10):  # 只計算開局 10 步內的走法
            move = run_mcts(board, 1000)
            row = get_next_open_row(board, move)
            if row == -1:
                break
            drop_piece(board, row, move, AI)
            store_mcts_result(board, move, shared_table)
    return

def parallel_mcts(int depth=100000, int num_threads=4):
    """ 讓 MCTS 在多核 CPU 上並行運算，並顯示運行時間 """
    from multiprocessing import Manager  # 在這裡引入 Manager
    cdef int num_cores = min(cpu_count(), num_threads)
    print(f"🚀 使用 {num_cores} 核心進行 MCTS 計算")
    start_time = time.time()
    
    # 建立共享字典
    manager = Manager()
    shared_table = manager.dict()
    
    # 使用 starmap 呼叫多核心任務，傳入 (sub_depth, shared_table)
    with Pool(num_cores) as pool:
        pool.starmap(precompute_mcts_task, [(depth // num_cores, shared_table)] * num_cores)
    
    # 儲存共享字典到檔案
    save_table(shared_table)
    end_time = time.time()
    print(f"✅ MCTS 預計算完成！總共花費 {end_time - start_time:.2f} 秒")

