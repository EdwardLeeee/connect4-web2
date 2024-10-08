# check_winner.py - 勝利檢查函數
def check_winner(board, player):
    # 檢查橫向、縱向和斜向的四連勝利
    rows, cols = len(board), len(board[0])
    for r in range(rows):
        for c in range(cols - 3):
            if all(board[r][c + i] == player for i in range(4)):
                return True

    for r in range(rows - 3):
        for c in range(cols):
            if all(board[r + i][c] == player for i in range(4)):
                return True

    for r in range(rows - 3):
        for c in range(cols - 3):
            if all(board[r + i][c + i] == player for i in range(4)):
                return True

    for r in range(3, rows):
        for c in range(cols - 3):
            if all(board[r - i][c + i] == player for i in range(4)):
                return True

    return False
    
def get_winning_cells(board, player):
    winning_cells = []

    for row in range(6):
        for col in range(7):
            # 檢查水平
            if col + 3 < 7 and board[row][col] == board[row][col + 1] == board[row][col + 2] == board[row][col + 3] == player:
                winning_cells = [{'row': row, 'col': col + i} for i in range(4)]
                return winning_cells

            # 檢查垂直
            if row + 3 < 6 and board[row][col] == board[row + 1][col] == board[row + 2][col] == board[row + 3][col] == player:
                winning_cells = [{'row': row + i, 'col': col} for i in range(4)]
                return winning_cells

            # 檢查對角線 \
            if row + 3 < 6 and col + 3 < 7 and board[row][col] == board[row + 1][col + 1] == board[row + 2][col + 2] == board[row + 3][col + 3] == player:
                winning_cells = [{'row': row + i, 'col': col + i} for i in range(4)]
                return winning_cells

            # 檢查對角線 /
            if row + 3 < 6 and col - 3 >= 0 and board[row][col] == board[row + 1][col - 1] == board[row + 2][col - 2] == board[row + 3][col - 3] == player:
                winning_cells = [{'row': row + i, 'col': col - i} for i in range(4)]
                return winning_cells

    return winning_cells

