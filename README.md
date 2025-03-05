## 機器人
```
pip install cython
pip install numpy
python3 cpy_setup.py build_ext --inplace
python3 cpy_run.py
```
## 線上連線 Connect 4
### 網址
想玩的話可以點以下連結

[線上Connect4](https://oraclelee.run.place)
### 須安裝之套件
```
pip install flask flask-socketio eventlet flask-cors
```

### 設置反向代理器教學
#### 1. 複製設定檔到設定區
```
sudo cp /path/to/connect4.conf /etc/nginx/sites-available
```

#### 2. 綁定設定檔至啟用區
> 如果預設還在的話請刪掉它 
> ```
> sudo rm /etc/nginx/sites-enabled/default
> ```
```
sudo ln -s /etc/nginx/sites-available/connect4.conf /etc/nginx/sites-enabled/
```
#### 3. 申請SSL憑證
> 3.1 如果還沒有申請到憑證，請先只設定80 port轉service的port就好，先不要設定SSL相關配置！！！！！。
>
> 3.2 請務必打開網頁API，不然申請時會502 Bad Gateway。
>
> 3.4 請打開數據機的 port
>
> 3.3 請打開 http/https 的防火牆
> ```
> sudo ufw allow 80/tcp
> sudo ufw allow 443/tcp
> sudo ufw reload
> ```

```
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d oraclelee.run.place
```
#### 4. 重新載入nignx設置
##### 4.1 刪掉暫時配置（http)
```
sudo rm /etc/nginx/sites-enabled/xxx.conf 
```
##### 4.2 載入有SSL憑證的設置
```
sudo ln -s /etc/nginx/sites-available/xxx.conf /etc/nginx/sites-enabled
```
##### 4.3 重新載入設置
```  
sudo systemctl reload nginx
```

### 背景執行
```
nohup python3 app.py &
```
#### 關掉
> 詳見[ps aux | grep python 教學](#ps-aux-|-grep-python-教學)
```
ps aux | grep python
```
找到它的PID，然後kill掉
```
kill xxx
```

## ps aux | grep python 教學
`ps aux | grep python` 是一個非常常見的命令，用來查找與 Python 相關的正在運行的進程。這裡是這個命令的分解解釋：

### 1. **`ps` 命令**
`ps` 是一個顯示系統當前正在運行進程的工具。它提供了有關正在執行的進程的詳細信息。

- **`a`**：顯示當前終端下所有用戶的進程（包括其他用戶的進程），而不僅僅是當前用戶的進程。
- **`u`**：以用戶為基礎顯示進程，這會顯示更多關於進程的詳細信息，包括用戶、CPU 和內存使用率、啟動時間等。
- **`x`**：顯示沒有控制終端的進程，這樣可以列出包括守護進程在內的所有進程。

### 2. **管道 (`|`)**
管道將 `ps aux` 的輸出結果傳遞給後面的命令。這裡是將 `ps aux` 的結果傳遞給 `grep` 命令，方便進一步篩選。

### 3. **`grep python`**
`grep` 是一個用來在文本中查找模式的命令。在這裡，`grep` 用來過濾 `ps aux` 的結果，只顯示包含 `python` 的行。

### 輸出解釋
運行 `ps aux | grep python` 之後，你會看到類似這樣的輸出：

```
user      12345  0.1  2.3 123456 7890 ?        S    12:34   0:01 python3 app.py
user      12350  0.0  0.0   7080  2048 pts/2    S+   12:35   0:00 grep --color=auto python
```

下面是輸出每個欄位的解釋：

1. **USER**：進程的擁有者（即運行該進程的用戶）。
2. **PID**：進程 ID（每個運行的進程都有一個唯一的 ID）。
3. **%CPU**：該進程佔用的 CPU 百分比。
4. **%MEM**：該進程佔用的內存百分比。
5. **VSZ**：該進程使用的虛擬內存大小（以 KB 為單位）。
6. **RSS**：該進程使用的實際物理內存大小（以 KB 為單位）。
7. **TTY**：進程的控制終端。如果是 `?`，表示該進程沒有控制終端（如守護進程）。
8. **STAT**：進程狀態：
   - **S**：休眠狀態（sleeping）
   - **R**：運行狀態（running）
   - **Z**：僵屍進程（zombie）
   - **T**：已停止（stopped）
9. **START**：進程的啟動時間。
10. **TIME**：進程已經使用的總 CPU 時間。
11. **COMMAND**：運行的命令，包括其參數。在這裡你會看到 `python3 app.py` 或 `grep python` 等命令。

### 示例分析
```
user      12345  0.1  2.3 123456 7890 ?        S    12:34   0:01 python3 app.py
```
- **user**：進程是由用戶 `user` 運行的。
- **12345**：這是進程的 ID。
- **0.1**：該進程佔用了 0.1% 的 CPU。
- **2.3**：該進程佔用了 2.3% 的內存。
- **123456**：該進程使用了 123456 KB 的虛擬內存。
- **7890**：該進程使用了 7890 KB 的物理內存。
- **?**：該進程沒有控制終端（因為它可能是守護進程或在後台運行）。
- **S**：進程處於休眠狀態（正在等待某些事件發生）。
- **12:34**：該進程啟動的時間是 12:34。
- **0:01**：該進程已經使用了 1 秒的 CPU 時間。
- **python3 app.py**：這是執行的命令。

### 注意：
最後一行通常會是 `grep` 命令本身的輸出（例如 `grep --color=auto python`），因為它也是一個進程，並且包含 `python` 這個關鍵詞。如果你不想看到這一行，可以使用以下命令來排除它：

```bash
ps aux | grep python | grep -v grep
```

`grep -v grep` 用來排除包含 `grep` 字樣的行。

### 總結：
- `ps aux` 列出當前所有正在運行的進程。
- `grep python` 過濾出包含 "python" 的進程。
- 使用這個命令可以快速檢查 Python 進程的運行情況，比如正在運行哪些 Python 程序，以及它們的資源佔用情況。

