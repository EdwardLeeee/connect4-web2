import mcts_table_build

# 使用 8 核心進行 100,000 次 MCTS 預計算
mcts_table_build.parallel_mcts(depth=10000, num_threads=8)

