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
> 3.1 如果還沒有申請到憑證，請先把和SSL憑證相關的設置註解掉。
>
> 3.2 請務必打開網頁API，不然申請時會502 Bad Gateway。
>
> 3.3 請打開 http/https 的防火牆
> ```
> sudo ufw allow 80/tcp
> sudo ufw allow 443/tcp
> sudo ufw reload
> ```
>
> 3.4 請打開數據機的 port

```
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d oraclelee.run.place
```
#### 4. 重新載入nignx設置
> 如果還有註解掉SSL相關設置，要重新打開
```
sudo systemctl reload nginx
```
